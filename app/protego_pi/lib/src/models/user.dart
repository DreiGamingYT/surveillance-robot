// lib/src/models/user.dart
class User {
  final int? id;
  final String email;
  final String? createdAt;

  User({this.id, required this.email, this.createdAt});

  factory User.fromJson(Map<String, dynamic> j) => User(
    id: j['id'] as int?,
    email: j['email'] as String,
    createdAt: j['created_at']?.toString(),
  );

  Map<String, dynamic> toJson() => {
    if (id != null) 'id': id,
    'email': email,
  };
}
