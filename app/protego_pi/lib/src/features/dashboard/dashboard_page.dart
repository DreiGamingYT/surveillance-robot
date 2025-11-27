// lib/src/features/dashboard/dashboard_page.dart
import 'package:flutter/material.dart';
import 'control_panel.dart';
import '../live_view/live_view_widget.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/telemetry_provider.dart';

class DashboardPage extends ConsumerWidget {
  const DashboardPage({Key? key}) : super(key: key);
  static const robotId = 'pi-001';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final telemetry = ref.watch(telemetryProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Protego Pi — Dashboard')),
      body: Column(
        children: [
          Expanded(flex: 3, child: LiveView()),            // live MJPEG stream
          const SizedBox(height: 8),
          SizedBox(height: 160, child: ControlPanel()),    // teleop controls
          const Divider(),
          Expanded(
            flex: 2,
            child: ListView.builder(
              itemCount: telemetry.length,
              itemBuilder: (context, i) {
                final t = telemetry[i];
                return ListTile(
                  title: Text('ID: ${t['id'] ?? '-'}'),
                  subtitle: Text(t['payload']?.toString() ?? t.toString()),
                  trailing: Text(t['created_at'] ?? ''),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
