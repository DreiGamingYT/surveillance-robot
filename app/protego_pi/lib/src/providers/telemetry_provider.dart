// lib/src/providers/telemetry_provider.dart
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'auth_provider.dart';

final telemetryProvider =
StateNotifierProvider<TelemetryNotifier, List<Map<String, dynamic>>>(
      (ref) => TelemetryNotifier(ref),
);

class TelemetryNotifier extends StateNotifier<List<Map<String, dynamic>>> {
  final Ref ref;

  TelemetryNotifier(this.ref) : super([]);

  Future<void> fetchLatest(String robotId) async {
    try {
      final api = ref.read(apiClientProvider);
      final resp = await api.get('/telemetry/recent', params: {'robotId': robotId});
      if (resp.statusCode == 200) {
        final body = jsonDecode(resp.body);
        if (body is List) {
          state = body.cast<Map<String, dynamic>>();
        }
      }
    } catch (e) {
      // silent fail - keep old state
    }
  }

  void add(Map<String, dynamic> item) {
    state = [item, ...state];
  }

  void clear() => state = [];
}
