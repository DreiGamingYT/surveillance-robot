// lib/src/api/api_client.dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';

class ApiClient {
  final String baseUrl;
  ApiClient({String? base}) : baseUrl = base ?? Config.apiBase;

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Future<http.Response> post(String path, Object body, {Map<String,String>? headers}) {
    final hdrs = {'Content-Type': 'application/json', ...?headers};
    return http.post(_uri(path), headers: hdrs, body: jsonEncode(body));
  }

  Future<http.Response> get(String path, {Map<String,String>? headers, Map<String,String>? params}) {
    final uri = params == null ? _uri(path) : Uri.parse('$baseUrl$path').replace(queryParameters: params);
    return http.get(uri, headers: headers);
  }
}
