import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';

class DbHelper {
  static final DbHelper _instance = DbHelper._internal();
  static Database? _database;

  factory DbHelper() {
    return _instance;
  }

  DbHelper._internal();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDb();
    return _database!;
  }

  Future<Database> _initDb() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, 'price_watch.db');

    return await openDatabase(
      path,
      version: 1,
      onCreate: _onCreate,
    );
  }

  Future<void> _onCreate(Database db, int version) async {
    // 1. Create stores table
    await db.execute('''
      CREATE TABLE stores (
        id INTEGER PRIMARY KEY,
        dti_sec_number TEXT NOT NULL UNIQUE,
        store_name TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        address TEXT NOT NULL,
        recidivism_index INTEGER DEFAULT 0
      )
    ''');

    // 2. Create srp_bulletins table
    await db.execute('''
      CREATE TABLE srp_bulletins (
        id INTEGER PRIMARY KEY,
        commodity_name TEXT NOT NULL,
        baseline_price REAL NOT NULL,
        effective_date TEXT NOT NULL,
        is_active INTEGER DEFAULT 1
      )
    ''');

    // 3. Create temporal_inspections table
    await db.execute('''
      CREATE TABLE temporal_inspections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        srp_id INTEGER NOT NULL,
        recorded_price REAL NOT NULL,
        is_flagged INTEGER NOT NULL,
        inspection_timestamp TEXT NOT NULL,
        sync_timestamp TEXT,
        officer_signature TEXT,
        vendor_signature TEXT,
        is_synced INTEGER DEFAULT 0,
        FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE,
        FOREIGN KEY (srp_id) REFERENCES srp_bulletins (id) ON DELETE CASCADE
      )
    ''');
  }

  // --- Store Operations ---
  Future<void> upsertStores(List<Map<String, dynamic>> storeList) async {
    final db = await database;
    await db.transaction((txn) async {
      for (var store in storeList) {
        await txn.insert(
          'stores',
          {
            'id': store['id'],
            'dti_sec_number': store['dti_sec_number'],
            'store_name': store['store_name'],
            'owner_name': store['owner_name'],
            'latitude': store['latitude'],
            'longitude': store['longitude'],
            'address': store['address'],
            'recidivism_index': store['recidivism_index'] ?? 0,
          },
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }
    });
  }

  Future<List<Map<String, dynamic>>> searchStores(String query) async {
    final db = await database;
    if (query.isEmpty) {
      return await db.query('stores');
    }
    return await db.query(
      'stores',
      where: 'store_name LIKE ? OR owner_name LIKE ? OR dti_sec_number LIKE ?',
      whereArgs: ['%$query%', '%$query%', '%$query%'],
    );
  }

  // --- Bulletin Operations ---
  Future<void> upsertBulletins(List<Map<String, dynamic>> bulletinList) async {
    final db = await database;
    await db.transaction((txn) async {
      for (var bulletin in bulletinList) {
        await txn.insert(
          'srp_bulletins',
          {
            'id': bulletin['id'],
            'commodity_name': bulletin['commodity_name'],
            'baseline_price': bulletin['baseline_price'],
            'effective_date': bulletin['effective_date'],
            'is_active': bulletin['is_active'] == true ? 1 : 0,
          },
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }
    });
  }

  Future<List<Map<String, dynamic>>> getActiveBulletins() async {
    final db = await database;
    return await db.query('srp_bulletins', where: 'is_active = ?', whereArgs: [1]);
  }

  // --- Inspection Operations ---
  Future<int> insertInspection(Map<String, dynamic> inspection) async {
    final db = await database;
    return await db.insert('temporal_inspections', inspection);
  }

  Future<List<Map<String, dynamic>>> getUnsyncedInspections() async {
    final db = await database;
    return await db.rawQuery('''
      SELECT ti.*, s.store_name, b.commodity_name, b.baseline_price
      FROM temporal_inspections ti
      JOIN stores s ON ti.store_id = s.id
      JOIN srp_bulletins b ON ti.srp_id = b.id
      WHERE ti.is_synced = 0
    ''');
  }

  Future<void> markInspectionsAsSynced(List<int> ids) async {
    final db = await database;
    await db.transaction((txn) async {
      for (var id in ids) {
        await txn.update(
          'temporal_inspections',
          {'is_synced': 1},
          where: 'id = ?',
          whereArgs: [id],
        );
      }
    });
  }
}
