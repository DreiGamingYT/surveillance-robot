// app/protego_pi/lib/src/api/api_client.dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  final String baseUrl;
  ApiClient(this.baseUrl);

  Future<Map?> postTelemetry(String robotId, Map payload) async {
    final res = await http.post(Uri.parse('$baseUrl/telemetry'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'robotId': robotId, 'payload': payload}),
    );
    if (res.statusCode == 200) return jsonDecode(res.body);
    return null;
  }
}
