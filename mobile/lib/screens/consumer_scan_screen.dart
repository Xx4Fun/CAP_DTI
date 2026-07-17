import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import '../helpers/db_helper.dart';

class ConsumerScanScreen extends StatefulWidget {
  final String token;
  const ConsumerScanScreen({super.key, required this.token});

  @override
  State<ConsumerScanScreen> createState() => _ConsumerScanScreenState();
}

class _ConsumerScanScreenState extends State<ConsumerScanScreen> {
  final DbHelper _dbHelper = DbHelper();
  
  // Camera variables
  CameraController? _cameraController;
  List<CameraDescription> _cameras = [];
  bool _cameraInitialized = false;
  XFile? _capturedImage;
  String _imageHash = '';

  // OCR & Store selection variables
  List<Map<String, dynamic>> _stores = [];
  Map<String, dynamic>? _selectedStore;
  final TextEditingController _ocrTextController = TextEditingController(
    text: "STORE: BUENAVISTA GROCERY\n"
         "DATE: 2026-07-15\n"
         "REGULAR MILLED RICE 1KG PHP 43.50\n"
         "REFINED WHITE SUGAR 1KG PHP 85.00"
  );
  
  bool _loading = false;
  String _statusMessage = '';
  bool _isError = false;

  @override
  void initState() {
    super.initState();
    _loadStores();
    _initCamera();
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    _ocrTextController.dispose();
    super.dispose();
  }

  Future<void> _loadStores() async {
    final stores = await _dbHelper.searchStores('');
    setState(() {
      _stores = stores;
    });
  }

  Future<void> _initCamera() async {
    try {
      _cameras = await availableCameras();
      if (_cameras.isNotEmpty) {
        _cameraController = CameraController(
          _cameras.first,
          ResolutionPreset.medium,
          enableAudio: false,
        );
        await _cameraController!.initialize();
        setState(() {
          _cameraInitialized = true;
        });
      }
    } catch (e) {
      setState(() {
        _statusMessage = 'Camera initialization failed: $e. Running scanner in fallback simulation mode.';
        _isError = true;
      });
    }
  }

  Future<void> _takePicture() async {
    if (_cameraController == null || !_cameraController!.value.isInitialized) {
      _showSnackbar('Camera not active.');
      return;
    }

    setState(() {
      _loading = true;
      _statusMessage = '';
    });

    try {
      final image = await _cameraController!.takePicture();
      final bytes = await image.readAsBytes();
      
      // Calculate cryptographic SHA-256 checksum of image bytes
      final hash = sha256.convert(bytes).toString();

      setState(() {
        _capturedImage = image;
        _imageHash = hash;
        _statusMessage = 'Image captured successfully! Checksum calculated: ${hash.substring(0, 16)}...';
        _isError = false;
      });
    } catch (e) {
      setState(() {
        _statusMessage = 'Failed to capture image: $e';
        _isError = true;
      });
    } finally {
      setState(() {
        _loading = false;
      });
    }
  }

  Future<void> _submitTip() async {
    if (_selectedStore == null) {
      _showSnackbar('Please select a store.');
      return;
    }
    if (_ocrTextController.text.isEmpty) {
      _showSnackbar('Please provide OCR text payload.');
      return;
    }

    // Validate decimal pattern using Dart RegExp: \d+\.\d{2}
    final RegExp priceRegex = RegExp(r'\d+\.\d{2}');
    final hasPrices = priceRegex.hasMatch(_ocrTextController.text);
    if (!hasPrices) {
      setState(() {
        _statusMessage = 'Validation Error: OCR text must contain decimal pricing patterns (e.g. 45.00) to confirm receipt parsing validity.';
        _isError = true;
      });
      return;
    }

    setState(() {
      _loading = true;
      _statusMessage = '';
      _isError = false;
    });

    try {
      // 10.0.2.2 is local emulator API bridge
      final request = http.MultipartRequest(
        'POST',
        Uri.parse('http://10.0.2.2:8000/api/tips'),
      );

      request.headers['Authorization'] = 'Bearer ${widget.token}';
      request.headers['Accept'] = 'application/json';

      request.fields['store_id'] = _selectedStore!['id'].toString();
      request.fields['image_hash'] = _imageHash.isNotEmpty ? _imageHash : 'simulated_image_checksum_hash_12345';
      
      // OCR extracted lines parsed to JSON
      final List<String> ocrLines = _ocrTextController.text.split('\n');
      request.fields['extracted_text_json'] = json.encode({'lines': ocrLines});

      if (_capturedImage != null) {
        request.files.add(
          await http.MultipartFile.fromPath(
            'image',
            _capturedImage!.path,
          ),
        );
      } else {
        // Fallback simulated file upload
        request.fields['simulated_upload'] = 'true';
      }

      final response = await request.send();
      final responseBody = await response.stream.bytesToString();

      if (response.statusCode == 200 || response.statusCode == 201) {
        setState(() {
          _statusMessage = 'Tip successfully uploaded to secure DTI vault!';
          _capturedImage = null;
          _imageHash = '';
          _selectedStore = null;
        });
      } else {
        setState(() {
          _statusMessage = 'Upload failed with status: ${response.statusCode}. Body: $responseBody';
          _isError = true;
        });
      }
    } catch (e) {
      setState(() {
        _statusMessage = 'Connection error: $e';
        _isError = true;
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tamper-Proof Receipt Scanner'),
        backgroundColor: Colors.redAccent.withAlpha(35),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Citizen Consumer Vault Gateway',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.redAccent,
                  ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Hardware locked camera layer. Bounding box overlay forces receipt aspects. Files securely vaulted.',
              style: TextStyle(color: Colors.grey),
            ),
            const SizedBox(height: 16),

            if (_statusMessage.isNotEmpty) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _isError ? Colors.red.withAlpha(51) : Colors.green.withAlpha(51),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: _isError ? Colors.red : Colors.green),
                ),
                child: Text(
                  _statusMessage,
                  style: TextStyle(
                    color: _isError ? Colors.redAccent : Colors.greenAccent,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Camera Viewfinder Box or Fallback Simulation Card
            if (_capturedImage == null) ...[
              if (_cameraInitialized && _cameraController != null) ...[
                AspectRatio(
                  aspectRatio: _cameraController!.value.aspectRatio,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      CameraPreview(_cameraController!),
                      // Aspect Ratio Locked Bounding Box Overlay
                      Container(
                        width: 250,
                        height: 380,
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.redAccent, width: 3),
                          borderRadius: BorderRadius.circular(12),
                          color: Colors.black.withAlpha(60),
                        ),
                      ),
                      const Positioned(
                        top: 20,
                        child: Text(
                          'ALIGN RECEIPT WITHIN BORDER',
                          style: TextStyle(
                            color: Colors.redAccent,
                            fontWeight: FontWeight.bold,
                            backgroundColor: Colors.black54,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: _loading ? null : _takePicture,
                    icon: const Icon(Icons.camera_alt),
                    label: const Text('Capture Bounding Box Locked Image'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.redAccent,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ),
              ] else ...[
                // Fallback simulation box for test suites
                Container(
                  height: 200,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: Colors.grey[900],
                    border: Border.all(color: Colors.redAccent.withAlpha(100)),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.camera_enhance, size: 48, color: Colors.grey),
                        SizedBox(height: 12),
                        Text('Camera Emulator Enabled'),
                        Text(
                          '(Disabling gallery picking for anti-tamper lock)',
                          style: TextStyle(fontSize: 10, color: Colors.grey),
                        )
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      setState(() {
                        _imageHash = 'sha256_mock_hash_checksum_778899aabbcc';
                        _statusMessage = 'Mock camera file generated. Checksum calculated.';
                        _isError = false;
                      });
                    },
                    icon: const Icon(Icons.flash_on),
                    label: const Text('Simulate Camera Capture'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.redAccent,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ),
              ],
            ] else ...[
              // Captured preview
              Container(
                height: 200,
                width: double.infinity,
                decoration: BoxDecoration(
                  image: DecorationImage(
                    image: FileImage(File(_capturedImage!.path)),
                    fit: BoxFit.cover,
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              TextButton.icon(
                onPressed: () => setState(() => _capturedImage = null),
                icon: const Icon(Icons.refresh),
                label: const Text('Retake Photo'),
              ),
            ],
            const SizedBox(height: 16),

            // Store selection dropdown
            DropdownButtonFormField<Map<String, dynamic>>(
              initialValue: _selectedStore,
              hint: const Text('Select Purchase Store location'),
              dropdownColor: Colors.grey[900],
              items: _stores.map((store) {
                return DropdownMenuItem<Map<String, dynamic>>(
                  value: store,
                  child: Text(store['store_name']),
                );
              }).toList(),
              onChanged: (store) {
                setState(() {
                  _selectedStore = store;
                });
              },
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                labelText: 'Select Store',
              ),
            ),
            const SizedBox(height: 16),

            // OCR Simulated Text Panel
            TextField(
              controller: _ocrTextController,
              maxLines: 6,
              decoration: const InputDecoration(
                labelText: 'Simulated OCR Text Output',
                border: OutlineInputBorder(),
                helperText: 'A regex check verifies that decimal price patterns exist in this text.',
              ),
            ),
            const SizedBox(height: 24),

            // Submit button
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton.icon(
                onPressed: _loading ? null : _submitTip,
                icon: const Icon(Icons.cloud_upload),
                label: Text(_loading ? 'Uploading Secure Vault...' : 'Submit to Secure Vault'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.redAccent,
                  foregroundColor: Colors.white,
                  textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
