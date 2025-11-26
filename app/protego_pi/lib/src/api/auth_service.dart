// lib/src/api/auth_service.dart
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api_client.dart';

class AuthService {
  final ApiClient api;
  final _storage = const FlutterSecureStorage();
  static const _kTokenKey = 'auth_token';

  AuthService(this.api);

  Future<bool> login(String email, String password) async {
    final res = await api.post('/auth/login', {'email': email, 'password': password});
    if (res.statusCode == 200) {
      final body = jsonDecode(res.body);
      final token = body['token'] as String?;
      if (token != null) {
        await _storage.write(key: _kTokenKey, value: token);
        return true;
      }
    }
    return false;
  }

  Future<void> logout() async {
    await _storage.delete(key: _kTokenKey);
  }

  Future<String?> getToken() => _storage.read(key: _kTokenKey);
}
