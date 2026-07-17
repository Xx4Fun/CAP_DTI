import 'dart:convert';
import 'package:http/http.dart' as http;
import '../helpers/db_helper.dart';

class SyncService {
  // 10.0.2.2 is the bridge IP for Android Emulator pointing to the development host's localhost (127.0.0.1)
  static const String baseUrl = 'http://10.0.2.2:8000/api';
  final DbHelper _dbHelper = DbHelper();

  // Downsync from Laravel API to SQLite
  Future<Map<String, dynamic>> syncDown(String token) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/sync/down'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Bearer $token',
        },
      );

      if (response.statusCode == 200) {
        final Map<String, dynamic> data = json.decode(response.body);
        
        final List<dynamic> stores = data['stores'] ?? [];
        final List<dynamic> bulletins = data['srp_bulletins'] ?? [];

        // Save to SQLite
        await _dbHelper.upsertStores(List<Map<String, dynamic>>.from(stores));
        await _dbHelper.upsertBulletins(List<Map<String, dynamic>>.from(bulletins));

        return {
          'success': true,
          'message': 'Downsync completed: ${stores.length} stores, ${bulletins.length} bulletins cached.',
        };
      } else {
        return {
          'success': false,
          'message': 'Downsync failed with status: ${response.statusCode}',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Downsync connection error: $e',
      };
    }
  }

  // Upsync local unsynced inspections to Laravel API
  Future<Map<String, dynamic>> syncUp(String token) async {
    try {
      final unsynced = await _dbHelper.getUnsyncedInspections();
      if (unsynced.isEmpty) {
        return {
          'success': true,
          'message': 'No pending inspections to upsync.',
        };
      }

      // Map SQLite columns to API request parameters
      final payload = unsynced.map((ins) {
        return {
          'store_id': ins['store_id'],
          'srp_id': ins['srp_id'],
          'recorded_price': ins['recorded_price'],
          'is_flagged': ins['is_flagged'] == 1,
          'inspection_timestamp': ins['inspection_timestamp'],
          'officer_signature': ins['officer_signature'],
          'vendor_signature': ins['vendor_signature'],
        };
      }).toList();

      final response = await http.post(
        Uri.parse('$baseUrl/sync/up'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: json.encode({'inspections': payload}),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        // Mark as synced locally
        final List<int> ids = unsynced.map<int>((ins) => ins['id'] as int).toList();
        await _dbHelper.markInspectionsAsSynced(ids);

        return {
          'success': true,
          'message': 'Successfully upsynced ${ids.length} inspections to central server.',
        };
      } else {
        return {
          'success': false,
          'message': 'Upsync failed with status: ${response.statusCode}',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Upsync connection error: $e',
      };
    }
  }
}
