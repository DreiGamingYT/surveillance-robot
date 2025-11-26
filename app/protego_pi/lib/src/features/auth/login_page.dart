// lib/src/features/auth/login_page.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_provider.dart';
import '../../api/auth_service.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({Key? key}) : super(key: key);
  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _email = TextEditingController();
  final _pass = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final authSvc = ref.read(authServiceProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Protego Pi — Login')),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(children: [
          TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email')),
          TextField(controller: _pass, decoration: const InputDecoration(labelText: 'Password'), obscureText: true),
          const SizedBox(height: 16),
          if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
          ElevatedButton(
            onPressed: _loading ? null : () async {
              setState((){ _loading = true; _error = null; });
              final ok = await authSvc.login(_email.text.trim(), _pass.text);
              setState((){ _loading = false; });
              if (ok) {
                ref.read(authStateProvider.notifier).state = true;
              } else {
                setState(()=> _error = 'Login failed');
              }
            },
            child: _loading ? const CircularProgressIndicator() : const Text('Login'),
          ),
        ]),
      ),
    );
  }
}
