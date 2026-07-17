# Phase 1: Laravel API Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize the central Laravel API backend, configure the Supabase PostgreSQL connection, run database migrations, and build basic API controllers with Sanctum authentication and tests.

**Architecture:** A decoupled RESTful API backend using Laravel Sanctum for token-based authentication. Features structured migrations for the Supabase remote PostgreSQL database (`cap_dti`), models with proper Eloquent relationships, and REST controllers verifying requests with feature tests.

**Tech Stack:** PHP 8.3, Composer, Laravel 11.x, Laravel Sanctum, PostgreSQL.

---

## Plan Decomposition

### Task 1: Scaffolding and Connection Configuration

**Files:**
- Create: `backend/.env`
- Modify: `backend/config/database.php`

- [ ] **Step 1: Scaffold Laravel application**
  Run:
  ```powershell
  $env:Path = "C:\Users\noych\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe;" + $env:Path
  composer create-project laravel/laravel backend
  ```
  Expected: `/backend` folder is populated with a fresh Laravel project.

- [ ] **Step 2: Copy Root .env to Backend**
  Copy: Copy connection variables from `c:\CAP101_DTI_SYS\.env` into `c:\CAP101_DTI_SYS\backend\.env`. Add the following database connection details if they aren't already set:
  ```env
  DB_CONNECTION=pgsql
  DB_HOST=db.rvatqhywtgyehigslyox.supabase.co
  DB_PORT=5432
  DB_DATABASE=postgres
  DB_USERNAME=postgres
  DB_PASSWORD="CapStone101_db"
  ```

- [ ] **Step 3: Test Database Connection**
  Run:
  ```powershell
  $env:Path = "C:\Users\noych\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe;" + $env:Path
  cd backend
  php artisan db:monitor
  ```
  Expected: Database connection `pgsql` reports OK.

- [ ] **Step 4: Commit**
  Run:
  ```bash
  git add backend
  git commit -m "feat: scaffold Laravel and configure Supabase connection"
  ```

---

### Task 2: Create Relational Migrations

**Files:**
- Create: `backend/database/migrations/2026_07_17_000001_create_all_tables.php`

- [ ] **Step 1: Write database migration**
  Create migration file at `backend/database/migrations/2026_07_17_000001_create_all_tables.php`:
  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration {
      public function up(): void {
          Schema::create('users', function (Blueprint $table) {
              $table->id();
              $table->string('name');
              $table->string('email')->unique();
              $table->string('password');
              $table->string('role'); // super_admin, dti_evaluator, field_officer, vendor, consumer
              $table->rememberToken();
              $table->timestamps();
          });

          Schema::create('stores', function (Blueprint $table) {
              $table->id();
              $table->string('dti_sec_number')->unique();
              $table->string('store_name');
              $table->string('owner_name');
              $table->decimal('latitude', 10, 8);
              $table->decimal('longitude', 11, 8);
              $table->text('address');
              $table->integer('recidivism_index')->default(0);
              $table->timestamps();
          });

          Schema::create('srp_bulletins', function (Blueprint $table) {
              $table->id();
              $table->string('commodity_name');
              $table->decimal('baseline_price', 8, 2);
              $table->date('effective_date');
              $table->boolean('is_active')->default(true);
              $table->timestamps();
          });

          Schema::create('item_aliases', function (Blueprint $table) {
              $table->id();
              $table->string('alias_name')->unique();
              $table->foreignId('srp_bulletin_id')->constrained('srp_bulletins')->onDelete('cascade');
              $table->timestamps();
          });

          Schema::create('temporal_inspections', function (Blueprint $table) {
              $table->id();
              $table->foreignId('store_id')->constrained('stores')->onDelete('cascade');
              $table->foreignId('srp_id')->constrained('srp_bulletins')->onDelete('cascade');
              $table->decimal('recorded_price', 8, 2);
              $table->boolean('is_flagged');
              $table->timestamp('inspection_timestamp');
              $table->timestamp('sync_timestamp')->useCurrent();
              $table->text('officer_signature')->nullable();
              $table->text('vendor_signature')->nullable();
              $table->timestamps();
          });

          Schema::create('citizen_tips', function (Blueprint $table) {
              $table->id();
              $table->foreignId('store_id')->nullable()->constrained('stores')->onDelete('set null');
              $table->json('extracted_text_json');
              $table->string('image_hash_path');
              $table->string('status')->default('pending'); // pending, validated, dismissed
              $table->timestamps();
          });

          Schema::create('legal_notices', function (Blueprint $table) {
              $table->id();
              $table->foreignId('store_id')->constrained('stores')->onDelete('cascade');
              $table->string('notice_type'); // LOI, SCO
              $table->string('pdf_file_path');
              $table->string('status')->default('issued'); // issued, acknowledged, rebutted, escalated
              $table->timestamp('due_date_timestamp');
              $table->timestamps();
          });
      }

      public function down(): void {
          Schema::dropIfExists('legal_notices');
          Schema::dropIfExists('citizen_tips');
          Schema::dropIfExists('temporal_inspections');
          Schema::dropIfExists('item_aliases');
          Schema::dropIfExists('srp_bulletins');
          Schema::dropIfExists('stores');
          Schema::dropIfExists('users');
      }
  };
  ```

- [ ] **Step 2: Run migration**
  Run:
  ```powershell
  $env:Path = "C:\Users\noych\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe;" + $env:Path
  cd backend
  php artisan migrate:fresh
  ```
  Expected: Migration output displays success messages creating all tables on the `cap_dti` database.

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add database/migrations
  git commit -m "feat: add schema migrations for PRICE-Watch database"
  ```

---

### Task 3: Build Models and Relationships

**Files:**
- Create: `backend/app/Models/Store.php`
- Create: `backend/app/Models/SrpBulletin.php`
- Create: `backend/app/Models/ItemAlias.php`
- Create: `backend/app/Models/TemporalInspection.php`
- Create: `backend/app/Models/CitizenTip.php`
- Create: `backend/app/Models/LegalNotice.php`
- Modify: `backend/app/Models/User.php`

- [ ] **Step 1: Configure Models**
  Create Model files with proper fillables and relations. For example, `backend/app/Models/Store.php`:
  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\HasMany;

  class Store extends Model {
      protected $fillable = ['dti_sec_number', 'store_name', 'owner_name', 'latitude', 'longitude', 'address', 'recidivism_index'];

      public function inspections(): HasMany {
          return $this->hasMany(TemporalInspection::class);
      }

      public function legalNotices(): HasMany {
          return $this->hasMany(LegalNotice::class);
      }
  }
  ```
  Configure relationships for other models:
  - `User`: `$fillable` includes `role`.
  - `SrpBulletin`: `hasMany(ItemAlias::class)` and `hasMany(TemporalInspection::class)`.
  - `ItemAlias`: `belongsTo(SrpBulletin::class)`.
  - `TemporalInspection`: `belongsTo(Store::class)`, `belongsTo(SrpBulletin::class, 'srp_id')`.
  - `CitizenTip`: `belongsTo(Store::class)`.
  - `LegalNotice`: `belongsTo(Store::class)`.

- [ ] **Step 2: Run a simple verification script**
  Run:
  ```powershell
  $env:Path = "C:\Users\noych\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe;" + $env:Path
  php artisan tinker --execute="echo App\Models\Store::count();"
  ```
  Expected: `0`

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add app/Models
  git commit -m "feat: implement Eloquent models with relationships"
  ```

---

### Task 4: Setup API Authentication and Sanctum

**Files:**
- Create: `backend/tests/Feature/AuthControllerTest.php`
- Create: `backend/app/Http/Controllers/AuthController.php`
- Modify: `backend/routes/api.php`

- [ ] **Step 1: Write Auth Test**
  Create `backend/tests/Feature/AuthControllerTest.php`:
  ```php
  <?php

  namespace Tests\Feature;

  use App\Models\User;
  use Illuminate\Foundation\Testing\RefreshDatabase;
  use Illuminate\Support\Facades\Hash;
  use Tests\TestCase;

  class AuthControllerTest extends TestCase {
      use RefreshDatabase;

      public function test_user_can_login_and_receive_sanctum_token(): void {
          $user = User::create([
              'name' => 'John Doe',
              'email' => 'john@example.com',
              'password' => Hash::make('password123'),
              'role' => 'dti_evaluator'
          ]);

          $response = $this->postJson('/api/login', [
              'email' => 'john@example.com',
              'password' => 'password123'
          ]);

          $response->assertStatus(200)
              ->assertJsonStructure(['token', 'user']);
      }
  }
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run:
  ```powershell
  $env:Path = "C:\Users\noych\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe;" + $env:Path
  php artisan test --filter=AuthControllerTest
  ```
  Expected: FAIL (route or class not found)

- [ ] **Step 3: Implement AuthController & Sanctum Setup**
  Install/publish Sanctum if needed:
  ```powershell
  php artisan install:api
  ```
  Create `backend/app/Http/Controllers/AuthController.php`:
  ```php
  <?php

  namespace App\Http\Controllers;

  use App\Models\User;
  use Illuminate\Http\Request;
  use Illuminate\Support\Facades\Hash;
  use Illuminate\Validation\ValidationException;

  class AuthController extends Controller {
      public function login(Request $request) {
          $request->validate([
              'email' => 'required|email',
              'password' => 'required',
          ]);

          $user = User::where('email', $request->email)->first();

          if (!$user || !Hash::check($request->password, $user->password)) {
              throw ValidationException::withMessages([
                  'email' => ['The provided credentials are incorrect.'],
              ]);
          }

          $token = $user->createToken('auth_token')->plainTextToken;

          return response()->json([
              'token' => $token,
              'user' => $user
          ]);
      }

      public function logout(Request $request) {
          $request->user()->currentAccessToken()->delete();
          return response()->json(['message' => 'Logged out successfully']);
      }
  }
  ```
  Register routes in `backend/routes/api.php`:
  ```php
  <?php

  use App\Http\Controllers\AuthController;
  use Illuminate\Support\Facades\Route;

  Route::post('/login', [AuthController::class, 'login']);
  Route::middleware('auth:sanctum')->post('/logout', [AuthController::class, 'logout']);
  ```

- [ ] **Step 4: Run test to verify it passes**
  Run:
  ```powershell
  $env:Path = "C:\Users\noych\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe;" + $env:Path
  php artisan test --filter=AuthControllerTest
  ```
  Expected: PASS

- [ ] **Step 5: Commit**
  Run:
  ```bash
  git add .
  git commit -m "feat: install Sanctum, add AuthController, and verify with tests"
  ```

---

### Task 5: Implement Stores & Sync API Controllers

**Files:**
- Create: `backend/tests/Feature/SyncControllerTest.php`
- Create: `backend/app/Http/Controllers/SyncController.php`
- Modify: `backend/routes/api.php`

- [ ] **Step 1: Write Sync Tests**
  Create `backend/tests/Feature/SyncControllerTest.php` to verify downsync and upsync endpoints:
  ```php
  <?php

  namespace Tests\Feature;

  use App\Models\User;
  use App\Models\Store;
  use App\Models\SrpBulletin;
  use Illuminate\Foundation\Testing\RefreshDatabase;
  use Laravel\Sanctum\Sanctum;
  use Tests\TestCase;

  class SyncControllerTest extends TestCase {
      use RefreshDatabase;

      public function test_authenticated_user_can_downsync_stores_and_bulletins(): void {
          $user = User::create([
              'name' => 'Field Officer',
              'email' => 'officer@example.com',
              'password' => bcrypt('password'),
              'role' => 'field_officer'
          ]);

          Store::create([
              'dti_sec_number' => 'SEC-12345',
              'store_name' => 'Buenavista Groceries',
              'owner_name' => 'Juan Dela Cruz',
              'latitude' => 10.7410,
              'longitude' => 121.9386,
              'address' => 'San Jose de Buenavista, Antique'
          ]);

          SrpBulletin::create([
              'commodity_name' => 'Sardines',
              'baseline_price' => 25.00,
              'effective_date' => '2026-07-01',
              'is_active' => true
          ]);

          Sanctum::actingAs($user);

          $response = $this->getJson('/api/sync/down');

          $response->assertStatus(200)
              ->assertJsonStructure(['stores', 'srp_bulletins']);
      }
  }
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run:
  ```powershell
  $env:Path = "C:\Users\noych\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe;" + $env:Path
  php artisan test --filter=SyncControllerTest
  ```
  Expected: FAIL with Route not found.

- [ ] **Step 3: Implement SyncController**
  Create `backend/app/Http/Controllers/SyncController.php`:
  ```php
  <?php

  namespace App\Http\Controllers;

  use App\Models\Store;
  use App\Models\SrpBulletin;
  use App\Models\TemporalInspection;
  use Illuminate\Http\Request;

  class SyncController extends Controller {
      public function down() {
          return response()->json([
              'stores' => Store::all(),
              'srp_bulletins' => SrpBulletin::where('is_active', true)->get()
          ]);
      }

      public function up(Request $request) {
          $request->validate([
              'inspections' => 'required|array',
              'inspections.*.store_id' => 'required|exists:stores,id',
              'inspections.*.srp_id' => 'required|exists:srp_bulletins,id',
              'inspections.*.recorded_price' => 'required|numeric',
              'inspections.*.is_flagged' => 'required|boolean',
              'inspections.*.inspection_timestamp' => 'required|date'
          ]);

          foreach ($request->inspections as $insData) {
              TemporalInspection::updateOrCreate(
                  [
                      'store_id' => $insData['store_id'],
                      'srp_id' => $insData['srp_id'],
                      'inspection_timestamp' => $insData['inspection_timestamp']
                  ],
                  [
                      'recorded_price' => $insData['recorded_price'],
                      'is_flagged' => $insData['is_flagged'],
                      'officer_signature' => $insData['officer_signature'] ?? null,
                      'vendor_signature' => $insData['vendor_signature'] ?? null
                  ]
              );
          }

          return response()->json(['message' => 'Sync completed successfully']);
      }
  }
  ```
  Register routes in `backend/routes/api.php`:
  ```php
  use App\Http\Controllers\SyncController;

  Route::middleware('auth:sanctum')->group(function () {
      Route::get('/sync/down', [SyncController::class, 'down']);
      Route::post('/sync/up', [SyncController::class, 'up']);
  });
  ```

- [ ] **Step 4: Run test to verify it passes**
  Run:
  ```powershell
  $env:Path = "C:\Users\noych\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe;" + $env:Path
  php artisan test --filter=SyncControllerTest
  ```
  Expected: PASS

- [ ] **Step 5: Commit**
  Run:
  ```bash
  git add .
  git commit -m "feat: add SyncController for downsync and upsync endpoints"
  ```
