// lib/src/providers/auth_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import '../api/api_client.dart';
import '../api/auth_service.dart';

final apiClientProvider = Provider((ref) => ApiClient());
final authServiceProvider = Provider((ref) => AuthService(ref.read(apiClientProvider)));
final authStateProvider = StateProvider<bool>((ref) => false);
