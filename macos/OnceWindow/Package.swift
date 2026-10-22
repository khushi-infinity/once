// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "OnceWindow",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "OnceWindow", targets: ["OnceWindow"])
    ],
    targets: [
        .executableTarget(
            name: "OnceWindow",
            path: "Sources/OnceWindow"
        )
    ]
)
