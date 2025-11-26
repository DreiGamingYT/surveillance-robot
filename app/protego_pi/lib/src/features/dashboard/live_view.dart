// lib/src/features/dashboard/live_view.dart
import 'package:flutter/material.dart';
import 'package:mjpeg/mjpeg.dart';

class LiveView extends StatelessWidget {
  LiveView({Key? key}) : super(key: key);

  // Replace with your Pi stream URL (e.g., http://<pi-ip>:8080/?action=stream)
  final String streamUrl = 'http://<PI_IP>:8080/?action=stream';

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black,
      child: Mjpeg(
        stream: streamUrl,
        isLive: true,
        error: (context, error, stack) {
          return Center(child: Text('Stream error: $error', style: const TextStyle(color: Colors.white)));
        },
      ),
    );
  }
}
