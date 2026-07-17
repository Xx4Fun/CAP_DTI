import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:price_watch/main.dart';

void main() {
  testWidgets('App loads login screen smoke test', (WidgetTester tester) async {
    // Set initial mock values for SharedPreferences to prevent hanging on loader
    SharedPreferences.setMockInitialValues({});

    // Build our app and trigger a frame.
    await tester.pumpWidget(const PriceWatchMobileApp());
    
    // Wait for the async SharedPreferences load to complete
    await tester.pumpAndSettle();

    // Verify that our login title is displayed.
    expect(find.text('PRICE-Watch Mobile'), findsOneWidget);
    expect(find.text('Sign In'), findsOneWidget);
  });
}
