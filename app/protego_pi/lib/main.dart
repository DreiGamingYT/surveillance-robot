// lib/main.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

void main() => runApp(RobotApp());

class RobotApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Surveillance Robot',
      theme: ThemeData(primarySwatch: Colors.blue),
      home: HomePage(),
      routes: {'/settings': (_) => SettingsPage()},
    );
  }
}

class Config {
  static const _baseKey = 'api_base_url';
  static Future<String> getBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_baseKey) ?? 'https://api.example.com'; // change default
  }
  static Future<void> setBaseUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_baseKey, url);
  }
}

class HomePage extends StatefulWidget {
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  String _baseUrl = '';
  Map<String, dynamic>? _status;
  List<dynamic>? _lidar;
  String? _cameraSnapshotUrl;
  bool _loading = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _loadBase();
  }

  Future<void> _loadBase() async {
    final url = await Config.getBaseUrl();
    setState(() => _baseUrl = url);
    _refreshAll();
  }

  Future<void> _refreshAll() async {
    setState(() { _loading = true; _error = ''; });
    try {
      await Future.wait([_fetchStatus(), _fetchLidar(), _fetchCamera()]);
    } catch (e) {
      setState(() { _error = e.toString(); });
    } finally {
      setState(() { _loading = false; });
    }
  }

  Future<void> _fetchStatus() async {
    final uri = Uri.parse('$_baseUrl/api/status'); // your backend route
    final res = await http.get(uri).timeout(Duration(seconds: 8));
    if (res.statusCode == 200) {
      setState(() => _status = json.decode(res.body));
    } else {
      throw Exception('Status fetch failed: ${res.statusCode}');
    }
  }

  Future<void> _fetchLidar() async {
    final uri = Uri.parse('$_baseUrl/api/lidar'); // returns JSON array of points
    final res = await http.get(uri).timeout(Duration(seconds: 8));
    if (res.statusCode == 200) {
      setState(() => _lidar = json.decode(res.body));
    } else {
      setState(() => _lidar = null);
    }
  }

  Future<void> _fetchCamera() async {
    // Option A: backend returns a snapshot URL or MJPEG URL.
    final uri = Uri.parse('$_baseUrl/api/camera'); // returns {"snapshot":"https://..."} or {"mjpeg":"..."}
    final res = await http.get(uri).timeout(Duration(seconds: 8));
    if (res.statusCode == 200) {
      final j = json.decode(res.body);
      setState(() => _cameraSnapshotUrl = j['snapshot'] ?? j['mjpeg'] ?? null);
    } else {
      setState(() => _cameraSnapshotUrl = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Surveillance Robot'),
        actions: [
          IconButton(icon: Icon(Icons.refresh), onPressed: _refreshAll),
          IconButton(icon: Icon(Icons.settings), onPressed: () => Navigator.pushNamed(context, '/settings').then((_) => _loadBase())),
        ],
      ),
      body: _loading
          ? Center(child: CircularProgressIndicator())
          : Padding(
        padding: EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_error.isNotEmpty) Text('Error: $_error', style: TextStyle(color: Colors.red)),
            Text('Base URL: $_baseUrl', style: TextStyle(fontWeight: FontWeight.bold)),
            SizedBox(height: 8),
            _status == null ? Text('No status') : _buildStatusCard(),
            SizedBox(height: 8),
            _cameraSnapshotUrl == null ? Text('No camera available') : _buildCameraPreview(),
            SizedBox(height: 8),
            Expanded(child: _buildLidarView()),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusCard() {
    return Card(
      child: ListTile(
        title: Text('Robot status'),
        subtitle: Text(_status!.entries.map((e) => '${e.key}: ${e.value}').join('\n')),
      ),
    );
  }

  Widget _buildCameraPreview() {
    // If your backend serves MJPEG or a snapshot URL, Image.network will display a snapshot.
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Camera', style: TextStyle(fontWeight: FontWeight.bold)),
          SizedBox(height: 8),
          AspectRatio(
            aspectRatio: 16/9,
            child: _cameraSnapshotUrl != null ? Image.network(_cameraSnapshotUrl!, fit: BoxFit.cover) : Container(),
          ),
        ],
      ),
    );
  }

  Widget _buildLidarView() {
    if (_lidar == null) return Center(child: Text('No LIDAR data'));
    return Card(
      child: Column(
        children: [
          ListTile(title: Text('LIDAR Points (${_lidar!.length})')),
          Expanded(
            child: ListView.builder(
              itemCount: _lidar!.length,
              itemBuilder: (_, i) {
                final p = _lidar![i];
                return ListTile(
                  dense: true,
                  title: Text('angle: ${p['angle'] ?? '-'} °  dist: ${p['distance'] ?? '-'} m'),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class SettingsPage extends StatefulWidget {
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}
class _SettingsPageState extends State<SettingsPage> {
  final _controller = TextEditingController();
  bool _saving = false;
  @override
  void initState() {
    super.initState();
    Config.getBaseUrl().then((v) => _controller.text = v);
  }
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Settings')),
      body: Padding(
        padding: EdgeInsets.all(12),
        child: Column(children: [
          TextField(controller: _controller, decoration: InputDecoration(labelText: 'Backend base URL (https://...)')),
          SizedBox(height: 12),
          ElevatedButton(
            onPressed: _saving ? null : () async {
              setState(() => _saving = true);
              await Config.setBaseUrl(_controller.text.trim());
              setState(() => _saving = false);
              Navigator.pop(context);
            },
            child: _saving ? CircularProgressIndicator() : Text('Save'),
          )
        ]),
      ),
    );
  }
}
