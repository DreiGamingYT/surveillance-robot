// lib/src/utils/validators.dart
bool isValidEmail(String email) {
  final re = RegExp(r"^[\w\.-]+@[\w\.-]+\.\w{2,}$");
  return re.hasMatch(email);
}

bool isNotEmpty(String? s) => s != null && s.trim().isNotEmpty;
