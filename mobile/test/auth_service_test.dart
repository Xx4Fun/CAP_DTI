import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:price_watch/services/auth_service.dart';

void main() {
  test('logs a real field officer in through the Laravel API', () async {
    final service = AuthService(client: MockClient((request) async {
      expect(request.url.path, '/api/login');
      expect(jsonDecode(request.body), {'email': 'officer@dti.gov.ph', 'password': 'secure-password'});
      return http.Response(jsonEncode({
        'token': 'real-sanctum-token',
        'user': {'role': 'field_officer'},
      }), 200, headers: {'content-type': 'application/json'});
    }), baseUrl: 'https://price-watch.test/api');

    final session = await service.login('officer@dti.gov.ph', 'secure-password');

    expect(session.token, 'real-sanctum-token');
    expect(session.role, 'field_officer');
  });

  test('rejects account roles that do not belong in the field app', () async {
    final service = AuthService(client: MockClient((request) async => http.Response(jsonEncode({
      'token': 'vendor-token',
      'user': {'role': 'vendor'},
    }), 200)), baseUrl: 'https://price-watch.test/api');

    expect(() => service.login('vendor@example.test', 'secure-password'), throwsA(isA<AuthException>()));
  });

  test('validates a saved DTI session against the server', () async {
    final service = AuthService(client: MockClient((request) async {
      expect(request.url.path, '/api/admin/session');
      expect(request.headers['Authorization'], 'Bearer saved-token');
      return http.Response(jsonEncode({'data': {'user': {'role': 'field_officer'}}}), 200);
    }), baseUrl: 'https://price-watch.test/api');

    expect(await service.validateSavedSession('saved-token', 'field_officer'), isTrue);
  });

  test('invalidates expired saved sessions', () async {
    final service = AuthService(client: MockClient((request) async => http.Response('{}', 401)), baseUrl: 'https://price-watch.test/api');

    expect(await service.validateSavedSession('expired-token', 'field_officer'), isFalse);
  });
}
