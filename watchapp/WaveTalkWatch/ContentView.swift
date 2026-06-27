import SwiftUI
import WatchKit

struct ContentView: View {
    @EnvironmentObject var session: WatchSession
    @State private var pressing = false

    var body: some View {
        VStack(spacing: 6) {

            // ── Canal ─────────────────────────────────────────────────
            HStack(spacing: 4) {
                Image(systemName: "dot.radiowaves.left.and.right")
                    .font(.system(size: 11))
                    .foregroundColor(.cyan)
                Text(session.channel)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.cyan)
                    .lineLimit(1)
            }

            // ── Quem está falando / online ────────────────────────────
            Group {
                if session.talking && !session.speaker.isEmpty {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(Color.green)
                            .frame(width: 6, height: 6)
                        Text(session.speaker)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.green)
                            .lineLimit(1)
                    }
                    .transition(.opacity.combined(with: .scale))
                } else {
                    Text(session.members > 0 ? "\(session.members) online" : "—")
                        .font(.system(size: 12))
                        .foregroundColor(.gray)
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.2), value: session.talking)

            Spacer(minLength: 4)

            // ── Botão PTT ─────────────────────────────────────────────
            ZStack {
                Circle()
                    .fill(pressing
                          ? Color.green.opacity(0.25)
                          : Color.cyan.opacity(0.12))
                    .frame(width: 76, height: 76)

                Circle()
                    .strokeBorder(pressing ? Color.green : Color.cyan,
                                  lineWidth: pressing ? 3 : 2)
                    .frame(width: 76, height: 76)

                Image(systemName: pressing ? "mic.fill" : "mic")
                    .font(.system(size: 28, weight: .medium))
                    .foregroundColor(pressing ? .green : .cyan)
            }
            .scaleEffect(pressing ? 1.08 : 1.0)
            .animation(.spring(response: 0.18, dampingFraction: 0.6), value: pressing)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        guard !pressing else { return }
                        pressing = true
                        WKInterfaceDevice.current().play(.click)
                        session.sendPTTStart()
                    }
                    .onEnded { _ in
                        pressing = false
                        WKInterfaceDevice.current().play(.stop)
                        session.sendPTTStop()
                    }
            )

            // ── Hint ──────────────────────────────────────────────────
            Text(pressing ? "transmitindo…" : "segurar p/ falar")
                .font(.system(size: 10))
                .foregroundColor(.gray)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 6)
        .onChange(of: session.talking) { isTalking in
            if isTalking { WKInterfaceDevice.current().play(.notification) }
        }
        .onChange(of: session.reachable) { ok in
            if !ok { WKInterfaceDevice.current().play(.failure) }
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
            .environmentObject(WatchSession.shared)
    }
}
