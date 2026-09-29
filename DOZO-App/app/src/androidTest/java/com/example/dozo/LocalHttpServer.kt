package com.example.dozo

import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/**
 * Minimal HTTP stub for instrumented tests.
 *
 * The app process makes real `HttpURLConnection` calls, so a JVM-level mock is not
 * enough. This binds a loopback port on the device (the instrumentation runs in the
 * app process, so `127.0.0.1` is reachable) and answers every request with the same
 * status + body. `requestCount` lets a test assert that a code path did (or did not)
 * hit the network.
 */
class LocalHttpServer(
    private val status: Int,
    private val body: String,
    private val contentType: String = "application/json"
) : AutoCloseable {

    private val server = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))

    val port: Int get() = server.localPort

    val baseUrl: String get() = "http://127.0.0.1:$port"

    @Volatile
    var requestCount: Int = 0
        private set

    private val worker = thread(isDaemon = true, name = "dozo-test-http") {
        while (!server.isClosed) {
            try {
                server.accept().use(::handle)
            } catch (_: Exception) {
                if (server.isClosed) break
            }
        }
    }

    private fun handle(client: Socket) {
        requestCount += 1
        val reader = client.getInputStream().bufferedReader(Charsets.UTF_8)
        // Drain the request line + headers so the client can finish writing.
        while (true) {
            val line = reader.readLine() ?: break
            if (line.isEmpty()) break
        }
        val bytes = body.toByteArray(Charsets.UTF_8)
        val reason = when (status) {
            200 -> "OK"
            401 -> "Unauthorized"
            else -> "Status"
        }
        val head = "HTTP/1.1 $status $reason\r\n" +
            "Content-Type: $contentType\r\n" +
            "Content-Length: ${bytes.size}\r\n" +
            "Connection: close\r\n\r\n"
        client.getOutputStream().apply {
            write(head.toByteArray(Charsets.US_ASCII))
            write(bytes)
            flush()
        }
    }

    override fun close() {
        runCatching { server.close() }
        runCatching { worker.join(500) }
    }
}
