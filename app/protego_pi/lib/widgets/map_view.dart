// lib/widgets/map_view.dart
import 'dart:async';
import 'package:flutter/material.dart';

class MapView extends StatefulWidget {
  final String mapUrlBase; // e.g. "https://your-render-url/static/map.png"
  final int refreshSeconds;
  const MapView({required this.mapUrlBase, this.refreshSeconds = 8, super.key});

  @override
  State<MapView> createState() => _MapViewState();
}

class _MapViewState extends State<MapView> {
  Timer? _timer;
  int _tick = 0;

  @override
  void initState() {
    super.initState();
    // start timer to refresh
    _timer = Timer.periodic(Duration(seconds: widget.refreshSeconds), (_) {
      setState(() {
        _tick++;
      });
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final url = '${widget.mapUrlBase}?t=${DateTime.now().millisecondsSinceEpoch + _tick}';
    return Center(
      child: AspectRatio(
        aspectRatio: 4/3,
        child: Image.network(
          url,
          fit: BoxFit.contain,
          errorBuilder: (ctx, err, st) => const Center(child: Text('Map not available')),
          loadingBuilder: (ctx, child, progress) {
            if (progress == null) return child;
            return const Center(child: CircularProgressIndicator());
          },
        ),
      ),
    );
  }
}
