// lib/src/app.dart
import 'package:flutter/material.dart';
import 'features/auth/login_page.dart';
import 'features/dashboard/dashboard_page.dart';
import 'providers/auth_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class MyApp extends ConsumerWidget {
  const MyApp({Key? key}) : super(key: key);
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loggedIn = ref.watch(authStateProvider);
    return MaterialApp(
      title: 'Protego Pi',
      theme: ThemeData(primarySwatch: Colors.blue),
      home: loggedIn ? const DashboardPage() : const LoginPage(),
    );
  }
}
