use super::*;

#[test]
fn native_target_transport_is_explicitly_unavailable() {
    assert!(AGENT_TUNNEL_UNAVAILABLE.contains("agent-backed"));
    assert!(AGENT_TUNNEL_UNAVAILABLE.contains("unavailable"));
}

#[test]
fn direct_target_process_implementation_is_absent() {
    let source = include_str!("../port_forward.rs").to_lowercase();

    assert!(!source.contains("command::new"));
    assert!(!source.contains("std::process"));
    assert!(!source.contains("kubectl"));
}

#[test]
fn session_identity_is_bounded_before_fail_closed_control() {
    assert!(require_session_id("session-1").is_ok());
    assert!(require_session_id("").is_err());
    assert!(require_session_id(&"x".repeat(65)).is_err());
}

#[test]
fn native_start_contract_requires_exact_capability_revision_and_loopback() {
    let request: StartPortForwardRequest = serde_json::from_value(serde_json::json!({
        "scope": {
            "workspaceId": "workspace-a",
            "clusterId": "cluster-a",
            "namespaces": ["shop"],
            "freshness": "live"
        },
        "resource": {
            "apiGroup": "",
            "version": "v1",
            "kind": "Service",
            "namespace": "shop",
            "name": "checkout",
            "uid": "uid-service-1"
        },
        "capabilityRevision": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "remotePort": 80,
        "localPort": 18080,
        "listenAddress": "127.0.0.1",
        "confirmation": true
    }))
    .expect("the exact native request must deserialize");

    assert_eq!(
        request.capability_revision,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    assert!(validate_start_request(&request).is_ok());

    let non_loopback = serde_json::from_value::<StartPortForwardRequest>(serde_json::json!({
        "scope": {
            "workspaceId": "workspace-a",
            "clusterId": "cluster-a",
            "namespaces": ["shop"],
            "freshness": "live"
        },
        "resource": {
            "apiGroup": "",
            "version": "v1",
            "kind": "Service",
            "namespace": "shop",
            "name": "checkout",
            "uid": "uid-service-1"
        },
        "capabilityRevision": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "remotePort": 80,
        "localPort": 18080,
        "listenAddress": "0.0.0.0",
        "confirmation": true
    }));
    assert!(non_loopback.is_err());
}
