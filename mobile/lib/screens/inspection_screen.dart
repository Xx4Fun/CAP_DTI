import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:signature/signature.dart';
import '../helpers/db_helper.dart';

class InspectionScreen extends StatefulWidget {
  const InspectionScreen({super.key});

  @override
  State<InspectionScreen> createState() => _InspectionScreenState();
}

class _InspectionScreenState extends State<InspectionScreen> {
  final DbHelper _dbHelper = DbHelper();

  // Search & Form States
  String _searchQuery = '';
  List<Map<String, dynamic>> _stores = [];
  Map<String, dynamic>? _selectedStore;

  List<Map<String, dynamic>> _bulletins = [];
  Map<String, dynamic>? _selectedBulletin;

  final TextEditingController _priceController = TextEditingController();
  bool _isFlagged = false;
  String _calculationWarning = '';

  // Signature Controllers
  late SignatureController _officerSigController;
  late SignatureController _vendorSigController;

  bool _loading = false;
  String _message = '';

  @override
  void initState() {
    super.initState();
    _officerSigController = SignatureController(
      penStrokeWidth: 3,
      penColor: Colors.amber,
      exportBackgroundColor: Colors.black,
    );
    _vendorSigController = SignatureController(
      penStrokeWidth: 3,
      penColor: Colors.blue,
      exportBackgroundColor: Colors.black,
    );
    _loadStores();
    _loadBulletins();
    _priceController.addListener(_calculateAnomaly);
  }

  @override
  void dispose() {
    _priceController.dispose();
    _officerSigController.dispose();
    _vendorSigController.dispose();
    super.dispose();
  }

  Future<void> _loadStores() async {
    final stores = await _dbHelper.searchStores(_searchQuery);
    setState(() {
      _stores = stores;
    });
  }

  Future<void> _loadBulletins() async {
    final bulletins = await _dbHelper.getActiveBulletins();
    setState(() {
      _bulletins = bulletins;
    });
  }

  void _calculateAnomaly() {
    if (_selectedBulletin == null || _priceController.text.isEmpty) {
      setState(() {
        _isFlagged = false;
        _calculationWarning = '';
      });
      return;
    }

    final double recorded = double.tryParse(_priceController.text) ?? 0.0;
    final double baseline = _selectedBulletin!['baseline_price'] as double;
    final double threshold = baseline * 1.10;

    if (recorded > threshold) {
      setState(() {
        _isFlagged = true;
        _calculationWarning = 'WARNING: Shelf price exceeds baseline SRP by more than 10%! (SRP: PHP ${baseline.toStringAsFixed(2)}, Max: PHP ${threshold.toStringAsFixed(2)})';
      });
    } else {
      setState(() {
        _isFlagged = false;
        _calculationWarning = 'Price within legal regulatory limits.';
      });
    }
  }

  Future<void> _saveInspection() async {
    if (_selectedStore == null) {
      _showSnackbar('Please select a store.');
      return;
    }
    if (_selectedBulletin == null) {
      _showSnackbar('Please select a commodity.');
      return;
    }
    if (_priceController.text.isEmpty) {
      _showSnackbar('Please enter recorded shelf price.');
      return;
    }

    setState(() {
      _loading = true;
      _message = '';
    });

    try {
      // Export signatures as base64 png
      final officerPng = await _officerSigController.toPngBytes();
      final vendorPng = await _vendorSigController.toPngBytes();

      final String? officerBase64 = officerPng != null ? base64Encode(officerPng) : null;
      final String? vendorBase64 = vendorPng != null ? base64Encode(vendorPng) : null;

      final double recordedPrice = double.tryParse(_priceController.text) ?? 0.0;

      final Map<String, dynamic> inspection = {
        'store_id': _selectedStore!['id'],
        'srp_id': _selectedBulletin!['id'],
        'recorded_price': recordedPrice,
        'is_flagged': _isFlagged ? 1 : 0,
        'inspection_timestamp': DateTime.now().toIso8601String(),
        'officer_signature': officerBase64,
        'vendor_signature': vendorBase64,
        'is_synced': 0,
      };

      await _dbHelper.insertInspection(inspection);

      setState(() {
        _message = 'Inspection successfully saved offline to SQLite!';
        _selectedStore = null;
        _selectedBulletin = null;
        _priceController.clear();
        _officerSigController.clear();
        _vendorSigController.clear();
        _isFlagged = false;
        _calculationWarning = '';
      });
    } catch (e) {
      setState(() {
        _message = 'Failed to save inspection: $e';
      });
    } finally {
      setState(() {
        _loading = false;
      });
    }
  }

  void _showSnackbar(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Offline Inspection Logger',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: Colors.amber,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Record local shelf prices offline. Computes violations against SRP matrix instantly.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.grey,
                ),
          ),
          const SizedBox(height: 20),

          // Message Alert
          if (_message.isNotEmpty) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: _message.contains('success') ? Colors.green.withOpacity(0.2) : Colors.red.withOpacity(0.2),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: _message.contains('success') ? Colors.green : Colors.red,
                ),
              ),
              child: Text(
                _message,
                style: TextStyle(
                  color: _message.contains('success') ? Colors.greenAccent : Colors.redAccent,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(height: 20),
          ],

          // 1. Select Store
          Card(
            color: Colors.grey[900],
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            child: Padding(
              padding: const EdgeInsets.all(12.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '1. Select Inspection Store',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.search),
                      hintText: 'Search stores by name or SEC...',
                      border: OutlineInputBorder(),
                    ),
                    onChanged: (val) {
                      setState(() {
                        _searchQuery = val;
                      });
                      _loadStores();
                    },
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<Map<String, dynamic>>(
                    value: _selectedStore,
                    hint: const Text('Choose a store'),
                    dropdownColor: Colors.grey[900],
                    items: _stores.map((store) {
                      return DropdownMenuItem<Map<String, dynamic>>(
                        value: store,
                        child: Text('${store['store_name']} (${store['owner_name']})'),
                      );
                    }).toList(),
                    onChanged: (store) {
                      setState(() {
                        _selectedStore = store;
                      });
                    },
                    decoration: const InputDecoration(border: OutlineInputBorder()),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // 2. Select Commodity and Enter Shelf Price
          Card(
            color: Colors.grey[900],
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            child: Padding(
              padding: const EdgeInsets.all(12.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '2. Price & Commodity Log',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<Map<String, dynamic>>(
                    value: _selectedBulletin,
                    hint: const Text('Choose regulated commodity'),
                    dropdownColor: Colors.grey[900],
                    items: _bulletins.map((bulletin) {
                      return DropdownMenuItem<Map<String, dynamic>>(
                        value: bulletin,
                        child: Text('${bulletin['commodity_name']} (SRP: ₱${bulletin['baseline_price']})'),
                      );
                    }).toList(),
                    onChanged: (bulletin) {
                      setState(() {
                        _selectedBulletin = bulletin;
                      });
                      _calculateAnomaly();
                    },
                    decoration: const InputDecoration(border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _priceController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                      prefixText: '₱ ',
                      labelText: 'Recorded Shelf Price',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  if (_calculationWarning.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      _calculationWarning,
                      style: TextStyle(
                        color: _isFlagged ? Colors.redAccent : Colors.greenAccent,
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    ),
                  ]
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // 3. Dual Signature Capture
          Card(
            color: Colors.grey[900],
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            child: Padding(
              padding: const EdgeInsets.all(12.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '3. Collect Signatures',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  const SizedBox(height: 12),
                  const Text('DTI Officer Signature:'),
                  const SizedBox(height: 8),
                  Container(
                    color: Colors.black,
                    child: Signature(
                      controller: _officerSigController,
                      height: 100,
                      backgroundColor: Colors.black,
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () => _officerSigController.clear(),
                    icon: const Icon(Icons.clear),
                    label: const Text('Clear Officer Signature'),
                  ),
                  const SizedBox(height: 12),
                  const Text('Store Owner/Vendor Signature:'),
                  const SizedBox(height: 8),
                  Container(
                    color: Colors.black,
                    child: Signature(
                      controller: _vendorSigController,
                      height: 100,
                      backgroundColor: Colors.black,
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () => _vendorSigController.clear(),
                    icon: const Icon(Icons.clear),
                    label: const Text('Clear Vendor Signature'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Submit
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton.icon(
              onPressed: _loading ? null : _saveInspection,
              icon: const Icon(Icons.save_alt),
              label: Text(_loading ? 'Saving to SQLite...' : 'Save Inspection Offline'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.amber,
                foregroundColor: Colors.black,
                textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
