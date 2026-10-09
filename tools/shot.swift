// Full-page screenshots of the local site with macOS's own WebKit, offscreen (adapted from the app's
// scripts/marketing/poster.swift). Phone sizes are drawn at 3x, like an iPhone; desktop at 2x.
//
//   swift tools/shot.swift <url> <css width> <out.png> [viewport height] [js to run before the shot] [seconds after it]
//
// Without a viewport height the whole page is captured.
import AppKit
import WebKit

let args = CommandLine.arguments
guard args.count >= 4, Double(args[2]) != nil else {
  fatalError("usage: shot.swift <url> <css width> <out.png> [viewport height] [js]")
}
let cssW = Double(args[2])!
let url = URL(string: args[1])!
let out = URL(fileURLWithPath: args[3])
let fixedH = args.count > 4 ? Double(args[4]) : nil
let script = args.count > 5 ? args[5] : ""
let delay = args.count > 6 ? Double(args[6])! : 0.7
let dpr: Double = cssW < 700 ? 3 : 2

final class Shooter: NSObject, WKNavigationDelegate {
  let window: NSWindow
  let web: WKWebView
  override init() {
    let config = WKWebViewConfiguration()
    config.preferences.inactiveSchedulingPolicy = .none
    let frame = NSRect(x: 0, y: 0, width: cssW, height: fixedH ?? 900)
    web = WKWebView(frame: frame, configuration: config)
    window = NSWindow(contentRect: NSRect(x: -20000, y: -20000, width: frame.width, height: frame.height), styleMask: [.borderless], backing: .buffered, defer: false)
    super.init()
    window.contentView = web
    window.orderBack(nil)
    web.navigationDelegate = self
    web.load(URLRequest(url: url))
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    web.evaluateJavaScript("document.fonts.ready.then(() => 1)") { _, _ in
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { self.size() }
    }
  }
  func size() {
    web.evaluateJavaScript("document.documentElement.scrollHeight") { h, _ in
      let height = fixedH ?? ((h as? Double) ?? 900)
      self.window.setContentSize(NSSize(width: cssW, height: height))
      self.web.frame = NSRect(x: 0, y: 0, width: cssW, height: height)
      self.web.evaluateJavaScript(script.isEmpty ? "1" : script) { result, err in
        if let err { print("script: \(err)") }
        if !script.isEmpty, let result { print("script returned: \(result)") }
        DispatchQueue.main.asyncAfter(deadline: .now() + (script.isEmpty ? 1.2 : delay)) { self.snap(height) }
      }
    }
  }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fatalError("\(error)") }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fatalError("\(error)") }
  func snap(_ height: Double) {
    let config = WKSnapshotConfiguration()
    config.rect = CGRect(x: 0, y: 0, width: cssW, height: height)
    config.afterScreenUpdates = true
    // points; the image comes back at the screen's backing scale, so ask for enough points to get dpr pixels
    config.snapshotWidth = NSNumber(value: cssW * dpr / Double(self.window.backingScaleFactor))
    web.takeSnapshot(with: config) { image, error in
      guard let image, let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { fatalError("snapshot: \(String(describing: error))") }
      let w = Int(cssW * dpr), h = Int(height * dpr)
      let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
      ctx.interpolationQuality = .high
      ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
      let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
      try! rep.representation(using: .png, properties: [:])!.write(to: out)
      print("\(out.path)  \(w)x\(h)")
      exit(0)
    }
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let shooter = Shooter()
DispatchQueue.main.asyncAfter(deadline: .now() + 60) { fatalError("timed out") }
app.run()
