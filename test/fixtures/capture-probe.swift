import AppKit
import ScreenCaptureKit
import CoreGraphics

@main
struct Probe {
    static func main() async {
        do {
            guard CGPreflightScreenCaptureAccess() else {
                print("{\"permission\":false}")
                return
            }
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            let displayID = UInt32(CommandLine.arguments[1])!
            guard let display = content.displays.first(where: { $0.displayID == displayID }) else {
                throw NSError(domain: "Probe", code: 1, userInfo: [NSLocalizedDescriptionKey: "Display not found"])
            }
            let filter = SCContentFilter(display: display, excludingWindows: [])
            let config = SCStreamConfiguration()
            config.width = display.width
            config.height = display.height
            config.showsCursor = false
            let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
            let width = image.width
            let height = image.height
            var pixels = [UInt8](repeating: 0, count: width * height * 4)
            let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
            guard let context = CGContext(data: &pixels, width: width, height: height, bitsPerComponent: 8,
                bytesPerRow: width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: bitmapInfo) else {
                throw NSError(domain: "Probe", code: 2)
            }
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            var markers = 0
            for offset in stride(from: 0, to: pixels.count, by: 4) {
                // Display P3 -> sRGB can shift this saturated color; detect its hue.
                if pixels[offset] > 180 &&
                   pixels[offset + 1] < 100 &&
                   pixels[offset + 2] > 150 {
                    markers += 1
                }
            }
            // Only counts leave this process. No desktop images are written or transmitted.
            print("{\"permission\":true,\"width\":\(width),\"height\":\(height),\"markerPixels\":\(markers)}")
        } catch {
            let data = try! JSONSerialization.data(withJSONObject: ["error": error.localizedDescription])
            print(String(data: data, encoding: .utf8)!)
            exit(1)
        }
    }
}
