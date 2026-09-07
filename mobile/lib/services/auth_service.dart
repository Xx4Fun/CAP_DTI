import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';

class AuthSession {
  final String token;
  final String role;

  const AuthSession({required this.token, required this.role});
}

class AuthException implements Exception {
  final String message;

  const AuthException(this.message);

  @override
  String toString() => message;
}

class AuthService {
  final http.Client? client;
  final String baseUrl;

  const AuthService({this.client, this.baseUrl = ApiConfig.baseUrl});

  Future<AuthSession> login(String email, String password) async {
    final requestClient = client ?? http.Client();
    try {
      final response = await requestClient.post(
        Uri.parse('$baseUrl/login'),
        headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
        body: jsonEncode({'email': email.trim().toLowerCase(), 'password': password}),
      );
      final payload = _decode(response.body);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw AuthException(_message(payload, 'The email or password is incorrect.'));
      }

      final token = payload['token'] as String?;
      final user = payload['user'] as Map<String, dynamic>?;
      final role = user?['role'] as String?;
      if (token == null || role == null) {
        throw const AuthException('The server returned an incomplete login response.');
      }
      if (role != 'field_officer' && role != 'consumer') {
        throw const AuthException('This account does not have access to the field application.');
      }
      return AuthSession(token: token, role: role);
    } on AuthException {
      rethrow;
    } catch (_) {
      throw const AuthException('Unable to reach PRICE-Watch. Check your connection and try again.');
    } finally {
      if (client == null) requestClient.close();
    }
  }

  Future<bool> validateSavedSession(String token, String role) async {
    if (role == 'consumer') return true;
    if (role != 'field_officer') return false;

    final requestClient = client ?? http.Client();
    try {
      final response = await requestClient.get(
        Uri.parse('$baseUrl/admin/session'),
        headers: {'Accept': 'application/json', 'Authorization': 'Bearer $token'},
      );
      if (response.statusCode != 200) return false;
      final payload = _decode(response.body);
      return payload['data']?['user']?['role'] == 'field_officer';
    } catch (_) {
      // Keep offline field sessions available; protected API calls will reject
      // an expired token when connectivity returns.
      return true;
    } finally {
      if (client == null) requestClient.close();
    }
  }

  Map<String, dynamic> _decode(String body) {
    if (body.isEmpty) return <String, dynamic>{};
    final decoded = jsonDecode(body);
    return decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
  }

  String _message(Map<String, dynamic> payload, String fallback) {
    final errors = payload['errors'];
    if (errors is Map && errors.isNotEmpty) {
      final first = errors.values.first;
      if (first is List && first.isNotEmpty) return first.first.toString();
    }
    return payload['message']?.toString() ?? fallback;
  }
}
