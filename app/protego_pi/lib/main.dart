// lib/main.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

// App screens & providers
import 'src/features/auth/login_page.dart';
import 'src/features/dashboard/dashboard_page.dart';
import 'src/providers/auth_provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Load env from lib/env/.env (adjust if you placed it elsewhere)
  await dotenv.load(fileName: 'lib/env/.env');
  runApp(const ProviderScope(child: MyApp()));
}

class MyApp extends ConsumerWidget {
  const MyApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // watch auth state provider (true => dashboard, false => login)
    final loggedIn = ref.watch(authStateProvider);
    return MaterialApp(
      title: 'Protego Pi',
      theme: ThemeData(
        primarySwatch: Colors.blue,
        useMaterial3: false,
      ),
      debugShowCheckedModeBanner: false,
      home: loggedIn ? const DashboardPage() : const LoginPage(),
    );
  }
}
