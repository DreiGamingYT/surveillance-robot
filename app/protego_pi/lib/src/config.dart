// lib/src/config.dart
import 'package:flutter_dotenv/flutter_dotenv.dart';

class Config {
  static String get apiBase {
    // prefer environment var, fallback to hard-coded dev URL
    return dotenv.env['API_BASE'] ?? 'https://surveillance-robot.onrender.com/';
  }
}
