// lib/src/features/dashboard/live_view.dart
import 'dart:async';
import 'package:flutter/material.dart';

class LiveView extends StatefulWidget {
  const LiveView({Key? key}) : super(key: key);

  @override
  State<LiveView> createState() => _LiveViewState();
}

class _LiveViewState extends State<LiveView> {
  // Change this to your Pi MJPEG stream (or use an ngrok URL for remote testing)
  final String streamUrl = 'http://<PI_IP>:8080/?action=stream';

  // We'll periodically reload the Image widget so it updates frames.
  // intervalMs controls refresh frequency (lower = smoother but more bandwidth).
  final int intervalMs = 500;

  // simple cache-busting counter
  int _tick = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(Duration(milliseconds: intervalMs), (_) {
      if (mounted) {
        setState(() {
          _tick++;
        });
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Append cache-buster param so the network image reloads regularly.
    final url = '$streamUrl&cb=$_tick';

    return Container(
      color: Colors.black,
      alignment: Alignment.center,
      child: InteractiveViewer(
        maxScale: 3.0,
        child: Image.network(
          url,
          gaplessPlayback: true,
          fit: BoxFit.contain,
          headers: const {
            // add headers here if your stream requires auth, e.g.
            // 'Authorization': 'Basic ...'
          },
          loadingBuilder: (context, child, loadingProgress) {
            if (loadingProgress == null) return child;
            return SizedBox(
              height: 200,
              child: Center(
                child: CircularProgressIndicator(
                  value: loadingProgress.expectedTotalBytes != null
                      ? loadingProgress.cumulativeBytesLoaded /
                      (loadingProgress.expectedTotalBytes ?? 1)
                      : null,
                ),
              ),
            );
          },
          errorBuilder: (context, error, stackTrace) {
            return SizedBox(
              height: 220,
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.videocam_off, color: Colors.white70, size: 48),
                    const SizedBox(height: 8),
                    const Text('Stream unavailable', style: TextStyle(color: Colors.white70)),
                    const SizedBox(height: 6),
                    Text(error.toString(), style: const TextStyle(color: Colors.white38, fontSize: 11)),
                    const SizedBox(height: 8),
                    ElevatedButton(
                      onPressed: () {
                        // force an immediate reload
                        setState(() => _tick++);
                      },
                      child: const Text('Retry'),
                    )
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
