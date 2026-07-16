use std::sync::atomic::{AtomicBool, Ordering};

use super::*;

#[test]
fn kubectl_process_spec_uses_a_fixed_executable_and_structured_exact_target_arguments() {
    let spec = kubectl_port_forward_spec(&start_request(Some(18_080)), 18_080)
        .expect("exact request should build a process spec");

    assert_eq!(spec.executable, "kubectl");
    assert_eq!(
        spec.args,
        [
            "--context",
            "cluster-a",
            "--namespace",
            "shop",
            "port-forward",
            "service/checkout",
            "18080:80",
            "--address",
            "127.0.0.1",
        ]
    );
}

#[test]
fn reservation_enforces_capacity_duplicate_ports_and_generation_safe_release() {
    let mut book = PortForwardSessionBook::with_capacity(2);
    let first = book
        .reserve("main", start_request(Some(18_080)), 18_080)
        .expect("first reservation should fit");

    assert!(book.reserve("main", start_request(Some(18_080)), 18_080).is_err());
    let second = book
        .reserve("main", start_request(Some(18_081)), 18_081)
        .expect("second distinct local port should fit");
    assert!(book.reserve("main", start_request(Some(18_082)), 18_082).is_err());
    assert!(!book.release_if_generation(&first.session_id, first.generation + 1));
    assert!(book.local_port_is_reserved(18_080));
    assert!(book.release_if_generation(&first.session_id, first.generation));
    assert!(!book.local_port_is_reserved(18_080));
    assert!(book.release_if_generation(&second.session_id, second.generation));
}

#[test]
fn inactive_history_is_pruned_without_consuming_active_capacity() {
    let mut book = PortForwardSessionBook::with_capacity(1);
    let failed = book
        .reserve("main", start_request(Some(18_080)), 18_080)
        .expect("first reservation should fit");
    assert!(book.mark_exit(
        &failed.session_id,
        failed.generation,
        ProcessExit {
            code: Some(7),
            success: false,
        },
        Some("failed".to_owned()),
    ));

    let replacement = book
        .reserve("main", start_request(Some(18_081)), 18_081)
        .expect("inactive history must not consume active capacity");

    assert!(!book.sessions.contains_key(&failed.session_id));
    assert!(book.sessions.contains_key(&replacement.session_id));
}

#[test]
fn exact_pod_target_is_supported_and_unconfirmed_requests_are_rejected() {
    let mut request = start_request(None);
    request.resource.kind = DesktopPortForwardResourceKind::Pod;
    request.resource.name = "checkout-abc".to_owned();
    request.resource.uid = "uid-pod-1".to_owned();
    request.remote_port = 8080;
    let spec = kubectl_port_forward_spec(&request, 18_080)
        .expect("exact Pod request should build a process spec");
    assert_eq!(spec.args[5], "pod/checkout-abc");
    assert_eq!(spec.args[6], "18080:8080");

    request.confirmation = false;
    assert!(kubectl_port_forward_spec(&request, 18_080).is_err());
}

#[test]
fn start_failure_releases_the_capacity_and_port_reservation() {
    let registry = PortForwardSessionRegistry::with_factory(1, Arc::new(FailingFactory));

    assert!(registry.start("main", start_request(Some(18_080))).is_err());
    assert!(registry.list("main").expect("registry should list").is_empty());
    assert!(registry.start("main", start_request(Some(18_080))).is_err());
}

#[test]
fn unexpected_child_exit_is_retained_as_an_error_and_window_cleanup_kills_children() {
    let process = Arc::new(FakeProcess::default());
    let registry = PortForwardSessionRegistry::with_factory(
        2,
        Arc::new(ReadyFactory {
            process: Arc::clone(&process),
        }),
    );
    let receipt = registry
        .start("main", start_request(Some(18_080)))
        .expect("fake process should become ready");
    assert_eq!(
        registry.list("main").expect("registry should list")[0].status,
        DesktopPortForwardStatus::Running
    );

    process.set_exit(ProcessExit {
        code: Some(7),
        success: false,
    });
    let deadline = Instant::now() + Duration::from_secs(1);
    loop {
        let sessions = registry.list("main").expect("registry should list");
        if sessions[0].status == DesktopPortForwardStatus::Error {
            assert_eq!(sessions[0].exit_code, Some(7));
            break;
        }
        assert!(Instant::now() < deadline, "exit watcher did not update session");
        thread::sleep(Duration::from_millis(10));
    }
    registry
        .recreate("main", &receipt.session_id, true)
        .expect("failed session should recreate on the same local port");
    registry.close_owner("main");
    assert!(process.killed.load(Ordering::Acquire));
    assert!(registry.list("main").expect("registry should list").is_empty());
}

struct FailingFactory;

impl PortForwardProcessFactory for FailingFactory {
    fn spawn(&self, _spec: &KubectlPortForwardSpec) -> Result<SpawnedPortForwardProcess, String> {
        Err("kubectl is unavailable".to_owned())
    }
}

struct ReadyFactory {
    process: Arc<FakeProcess>,
}

impl PortForwardProcessFactory for ReadyFactory {
    fn spawn(&self, spec: &KubectlPortForwardSpec) -> Result<SpawnedPortForwardProcess, String> {
        self.process.clear_exit();
        let (sender, output) = mpsc::channel();
        sender
            .send(format!(
                "Forwarding from 127.0.0.1:{} -> 80",
                spec_local_port(spec)
            ))
            .expect("ready output should send");
        Ok(SpawnedPortForwardProcess {
            process: self.process.clone(),
            output,
        })
    }
}

#[derive(Default)]
struct FakeProcess {
    exit: Mutex<Option<ProcessExit>>,
    killed: AtomicBool,
}

impl FakeProcess {
    fn set_exit(&self, exit: ProcessExit) {
        *self.exit.lock().expect("fake process lock") = Some(exit);
    }

    fn clear_exit(&self) {
        *self.exit.lock().expect("fake process lock") = None;
    }
}

impl PortForwardProcess for FakeProcess {
    fn kill(&self) -> Result<(), String> {
        self.killed.store(true, Ordering::Release);
        self.set_exit(ProcessExit {
            code: Some(143),
            success: false,
        });
        Ok(())
    }

    fn try_wait(&self) -> Result<Option<ProcessExit>, String> {
        Ok(*self.exit.lock().map_err(|_| "fake process lock".to_owned())?)
    }
}

fn spec_local_port(spec: &KubectlPortForwardSpec) -> u16 {
    spec.args[6]
        .split(':')
        .next()
        .expect("port mapping")
        .parse()
        .expect("local port")
}

fn start_request(local_port: Option<u16>) -> StartPortForwardRequest {
    StartPortForwardRequest {
        scope: DesktopClusterScope {
            workspace_id: "workspace-a".to_owned(),
            cluster_id: "cluster-a".to_owned(),
            namespaces: vec!["shop".to_owned()],
            freshness: DesktopFreshness::Live,
        },
        resource: DesktopPortForwardResourceRef {
            api_group: String::new(),
            version: "v1".to_owned(),
            kind: DesktopPortForwardResourceKind::Service,
            namespace: "shop".to_owned(),
            name: "checkout".to_owned(),
            uid: "uid-service-1".to_owned(),
        },
        remote_port: 80,
        local_port,
        listen_address: DesktopListenAddress::Loopback,
        confirmation: true,
    }
}
