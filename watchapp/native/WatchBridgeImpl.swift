import Foundation
import WatchConnectivity

@objc(WatchBridge)
class WatchBridgeImpl: RCTEventEmitter, WCSessionDelegate {

    private var hasListeners = false

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    @objc override static func requiresMainQueueSetup() -> Bool { false }

    override func supportedEvents() -> [String] {
        ["watch:ptt:start", "watch:ptt:stop"]
    }

    override func startObserving() { hasListeners = true }
    override func stopObserving()  { hasListeners = false }

    // Called from React Native to push state to the Watch
    @objc(sendUpdate:)
    func sendUpdate(_ data: NSDictionary) {
        guard WCSession.isSupported(),
              WCSession.default.activationState == .activated,
              WCSession.default.isReachable,
              let dict = data as? [String: Any]
        else { return }
        WCSession.default.sendMessage(dict, replyHandler: nil, errorHandler: nil)
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        guard hasListeners, let action = message["action"] as? String else { return }
        let event = action == "ptt:start" ? "watch:ptt:start" : "watch:ptt:stop"
        sendEvent(withName: event, body: nil)
    }

    func session(_ session: WCSession,
                 activationDidCompleteWith state: WCSessionActivationState,
                 error: Error?) {}

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }
}
