// lib/src/features/dashboard/control_panel.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../../config.dart';

class ControlPanel extends StatelessWidget {
  const ControlPanel({Key? key}) : super(key: key);
  final String apiBase = Config.apiBase;

  Future<void> send(String action, double speed) async {
    final uri = Uri.parse('$apiBase/control');
    final res = await http.post(uri,
        headers: {'Content-Type':'application/json'},
        body: jsonEncode({'robotId':'pi-001','command':{'action': action, 'speed': speed}})
    );
    // you can parse body and show toast/snackbar
    debugPrint('control status: ${res.statusCode}, body: ${res.body}');
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(12.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          ElevatedButton(onPressed: ()=>send('left', 0.4), child: const Text('Left')),
          Column(
            children: [
              ElevatedButton(onPressed: ()=>send('forward', 0.6), child: const Text('Forward')),
              const SizedBox(height: 8),
              ElevatedButton(onPressed: ()=>send('back', 0.6), child: const Text('Back')),
            ],
          ),
          ElevatedButton(onPressed: ()=>send('right', 0.4), child: const Text('Right')),
          ElevatedButton(onPressed: ()=>send('stop', 0.0), child: const Text('Stop')),
        ],
      ),
    );
  }
}
