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
