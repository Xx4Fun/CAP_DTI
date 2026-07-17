import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'helpers/db_helper.dart';
import 'services/sync_service.dart';
import 'screens/inspection_screen.dart';
import 'screens/consumer_scan_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const PriceWatchMobileApp());
}

class PriceWatchMobileApp extends StatelessWidget {
  const PriceWatchMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PRICE-Watch Mobile',
      theme: ThemeData.dark().copyWith(
        primaryColor: Colors.amber,
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.amber,
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF09090B),
        cardColor: const Color(0xFF141419),
      ),
      home: const AuthWrapper(),
    );
  }
}

class AuthWrapper extends StatefulWidget {
  const AuthWrapper({super.key});

  @override
  State<AuthWrapper> createState() => _AuthWrapperState();
}

class _AuthWrapperState extends State<AuthWrapper> {
  String? _token;
  String? _role;
  bool _checking = true;

  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _token = prefs.getString('auth_token');
      _role = prefs.getString('user_role');
      _checking = false;
    });
  }

  void _onLoginSuccess(String token, String role) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', token);
    await prefs.setString('user_role', role);
    setState(() {
      _token = token;
      _role = role;
    });
  }

  void _onLogout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
    await prefs.remove('user_role');
    setState(() {
      _token = null;
      _role = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: Colors.amber)),
      );
    }

    if (_token == null) {
      return MobileLoginScreen(onLoginSuccess: _onLoginSuccess);
    }

    if (_role == 'consumer') {
      return Scaffold(
        body: ConsumerScanScreen(token: _token!),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _onLogout,
          icon: const Icon(Icons.exit_to_app),
          label: const Text('Log Out'),
          backgroundColor: Colors.redAccent,
        ),
      );
    }

    return MobileHomeScreen(token: _token!, onLogout: _onLogout);
  }
}

class MobileLoginScreen extends StatefulWidget {
  final Function(String, String) onLoginSuccess;
  const MobileLoginScreen({super.key, required this.onLoginSuccess});

  @override
  State<MobileLoginScreen> createState() => _MobileLoginScreenState();
}

class _MobileLoginScreenState extends State<MobileLoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;
  String _error = '';

  Future<void> _handleLogin() async {
    setState(() {
      _loading = true;
      _error = '';
    });

    // Simulated login endpoint or direct mock auth validation
    final String email = _emailController.text;
    final String pass = _passwordController.text;

    if (email == 'officer@dti.gov.ph' && pass == 'password123') {
      widget.onLoginSuccess('mock_field_officer_token_123456', 'field_officer');
    } else if (email == 'consumer@price.gov.ph' && pass == 'password123') {
      widget.onLoginSuccess('mock_consumer_token_123456', 'consumer');
    } else {
      setState(() {
        _error = 'Incorrect credentials.\n'
            'Officer: officer@dti.gov.ph / password123\n'
            'Consumer: consumer@price.gov.ph / password123';
      });
    }
    setState(() {
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: const BoxDecoration(
                  color: Colors.amber,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.security, size: 40, color: Colors.black),
              ),
              const SizedBox(height: 16),
              const Text(
                'PRICE-Watch Mobile',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.amber),
              ),
              const SizedBox(height: 8),
              const Text(
                'Antique Offline Regulatory Node',
                style: TextStyle(color: Colors.grey),
              ),
              const SizedBox(height: 32),
              if (_error.isNotEmpty) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.withAlpha(51),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red),
                  ),
                  child: Text(
                    _error,
                    style: const TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(height: 20),
              ],
              TextField(
                controller: _emailController,
                decoration: const InputDecoration(
                  labelText: 'Email Address',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.email),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _passwordController,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Password',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.lock),
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _loading ? null : _handleLogin,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.amber,
                    foregroundColor: Colors.black,
                    textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  child: _loading ? const CircularProgressIndicator() : const Text('Sign In'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class MobileHomeScreen extends StatefulWidget {
  final String token;
  final VoidCallback onLogout;

  const MobileHomeScreen({super.key, required this.token, required this.onLogout});

  @override
  State<MobileHomeScreen> createState() => _MobileHomeScreenState();
}

class _MobileHomeScreenState extends State<MobileHomeScreen> {
  final SyncService _syncService = SyncService();
  final DbHelper _dbHelper = DbHelper();
  int _unsyncedCount = 0;
  bool _syncing = false;
  String _syncResult = '';

  @override
  void initState() {
    super.initState();
    _updateUnsyncedCount();
  }

  Future<void> _updateUnsyncedCount() async {
    final list = await _dbHelper.getUnsyncedInspections();
    setState(() {
      _unsyncedCount = list.length;
    });
  }

  Future<void> _triggerDownsync() async {
    setState(() {
      _syncing = true;
      _syncResult = '';
    });
    final result = await _syncService.syncDown(widget.token);
    setState(() {
      _syncResult = result['message'];
      _syncing = false;
    });
  }

  Future<void> _triggerUpsync() async {
    setState(() {
      _syncing = true;
      _syncResult = '';
    });
    final result = await _syncService.syncUp(widget.token);
    setState(() {
      _syncResult = result['message'];
      _syncing = false;
    });
    _updateUnsyncedCount();
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('DTI Officer Node'),
          actions: [
            IconButton(
              icon: const Icon(Icons.exit_to_app),
              onPressed: widget.onLogout,
            ),
          ],
          bottom: const TabBar(
            tabs: [
              Tab(icon: Icon(Icons.assignment), text: 'Log Inspection'),
              Tab(icon: Icon(Icons.sync), text: 'Data Sync'),
            ],
            indicatorColor: Colors.amber,
            labelColor: Colors.amber,
          ),
        ),
        body: TabBarView(
          children: [
            const InspectionScreen(),
            _buildSyncTab(),
          ],
        ),
      ),
    );
  }

  Widget _buildSyncTab() {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Synchronize Field Logs',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: Colors.amber,
                ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Pre-deployment sync downloads the target store database. Post-deployment sync uploads offline-logged anomaly files.',
            style: TextStyle(color: Colors.grey),
          ),
          const SizedBox(height: 24),
          Card(
            color: Colors.grey[900],
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Offline Cache Status',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Pending Upsync Inspections:'),
                      Chip(
                        label: Text('$_unsyncedCount'),
                        backgroundColor: _unsyncedCount > 0 ? Colors.redAccent : Colors.green,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          if (_syncing) ...[
            const Center(child: CircularProgressIndicator(color: Colors.amber)),
            const SizedBox(height: 20),
          ] else ...[
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                onPressed: _triggerDownsync,
                icon: const Icon(Icons.download),
                label: const Text('Sync Down: Catalog & Active SRPs'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blueAccent,
                  foregroundColor: Colors.white,
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                onPressed: _triggerUpsync,
                icon: const Icon(Icons.upload),
                label: const Text('Sync Up: Upload Inspection Logs'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  foregroundColor: Colors.white,
                ),
              ),
            ),
          ],
          if (_syncResult.isNotEmpty) ...[
            const SizedBox(height: 24),
            const Text(
              'Sync Logs Output:',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey[850],
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                _syncResult,
                style: const TextStyle(fontFamily: 'monospace'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
