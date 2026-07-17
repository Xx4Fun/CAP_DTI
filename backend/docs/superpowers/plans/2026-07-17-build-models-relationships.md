# Build Models and Relationships Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create Eloquent models in Laravel with appropriate `$fillable` attributes, `$casts`, and relationship mappings to support the PRICE-Watch system's schema.

**Architecture:** Models will represent tables in the database, defining fillables, properties, and standard Eloquent relations (e.g., HasMany, BelongsTo) mapping the database columns.

**Tech Stack:** Laravel (PHP 8.3), Eloquent ORM

---

### Task 1: Update User Model
**Files:**
- Modify: `backend/app/Models/User.php`

- [ ] **Step 1: Edit `User.php` to include `role` in fillables**
  Update the `Fillable` attribute or property of `User` model to include `role`.
  
  ```php
  #[Fillable(['name', 'email', 'password', 'role'])]
  ```

### Task 2: Create Store Model
**Files:**
- Create: `backend/app/Models/Store.php`

- [ ] **Step 1: Create `Store.php` file**
  Implement the `Store` model extending `Illuminate\Database\Eloquent\Model`. Define relationships to `TemporalInspection`, `LegalNotice`, and `CitizenTip`.
  
  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\HasMany;

  class Store extends Model
  {
      protected $fillable = [
          'dti_sec_number',
          'store_name',
          'owner_name',
          'latitude',
          'longitude',
          'address',
          'recidivism_index',
      ];

      protected $casts = [
          'latitude' => 'float',
          'longitude' => 'float',
          'recidivism_index' => 'integer',
      ];

      public function inspections(): HasMany
      {
          return $this->hasMany(TemporalInspection::class);
      }

      public function legalNotices(): HasMany
      {
          return $this->hasMany(LegalNotice::class);
      }

      public function citizenTips(): HasMany
      {
          return $this->hasMany(CitizenTip::class);
      }
  }
  ```

### Task 3: Create SrpBulletin Model
**Files:**
- Create: `backend/app/Models/SrpBulletin.php`

- [ ] **Step 1: Create `SrpBulletin.php` file**
  Implement the `SrpBulletin` model with appropriate fillables and relationships.
  
  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\HasMany;

  class SrpBulletin extends Model
  {
      protected $fillable = [
          'commodity_name',
          'baseline_price',
          'effective_date',
          'is_active',
      ];

      protected $casts = [
          'baseline_price' => 'float',
          'effective_date' => 'date',
          'is_active' => 'boolean',
      ];

      public function aliases(): HasMany
      {
          return $this->hasMany(ItemAlias::class, 'srp_bulletin_id');
      }

      public function inspections(): HasMany
      {
          return $this->hasMany(TemporalInspection::class, 'srp_id');
      }
  }
  ```

### Task 4: Create ItemAlias Model
**Files:**
- Create: `backend/app/Models/ItemAlias.php`

- [ ] **Step 1: Create `ItemAlias.php` file**
  Implement the `ItemAlias` model with appropriate fillables and relationships.
  
  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;

  class ItemAlias extends Model
  {
      protected $fillable = [
          'alias_name',
          'srp_bulletin_id',
      ];

      public function bulletin(): BelongsTo
      {
          return $this->belongsTo(SrpBulletin::class, 'srp_bulletin_id');
      }
  }
  ```

### Task 5: Create TemporalInspection Model
**Files:**
- Create: `backend/app/Models/TemporalInspection.php`

- [ ] **Step 1: Create `TemporalInspection.php` file**
  Implement the `TemporalInspection` model with appropriate fillables, casts, and relationships.
  
  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;

  class TemporalInspection extends Model
  {
      protected $fillable = [
          'store_id',
          'srp_id',
          'recorded_price',
          'is_flagged',
          'inspection_timestamp',
          'sync_timestamp',
          'officer_signature',
          'vendor_signature',
      ];

      protected $casts = [
          'recorded_price' => 'float',
          'is_flagged' => 'boolean',
          'inspection_timestamp' => 'datetime',
          'sync_timestamp' => 'datetime',
      ];

      public function store(): BelongsTo
      {
          return $this->belongsTo(Store::class);
      }

      public function bulletin(): BelongsTo
      {
          return $this->belongsTo(SrpBulletin::class, 'srp_id');
      }
  }
  ```

### Task 6: Create CitizenTip Model
**Files:**
- Create: `backend/app/Models/CitizenTip.php`

- [ ] **Step 1: Create `CitizenTip.php` file**
  Implement the `CitizenTip` model with JSON casting and relationships.
  
  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;

  class CitizenTip extends Model
  {
      protected $fillable = [
          'store_id',
          'extracted_text_json',
          'image_hash_path',
          'status',
      ];

      protected $casts = [
          'extracted_text_json' => 'array',
      ];

      public function store(): BelongsTo
      {
          return $this->belongsTo(Store::class);
      }
  }
  ```

### Task 7: Create LegalNotice Model
**Files:**
- Create: `backend/app/Models/LegalNotice.php`

- [ ] **Step 1: Create `LegalNotice.php` file**
  Implement the `LegalNotice` model with appropriate fillables and relationships.
  
  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;

  class LegalNotice extends Model
  {
      protected $fillable = [
          'store_id',
          'notice_type',
          'pdf_file_path',
          'status',
          'due_date_timestamp',
      ];

      protected $casts = [
          'due_date_timestamp' => 'datetime',
      ];

      public function store(): BelongsTo
      {
          return $this->belongsTo(Store::class);
      }
  }
  ```

### Task 8: Verification
**Files:**
- Run verification script in PowerShell/Terminal

- [ ] **Step 1: Run verification command**
  Run:
  ```powershell
  $env:Path = "C:\\Users\\noych\\AppData\\Local\\Microsoft\\WinGet\\Packages\\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe;" + $env:Path
  php artisan tinker --execute="echo App\\Models\\Store::count();"
  ```
  Expected output: `0`

### Task 9: Git Commit
**Files:**
- Commit the changes to version control

- [ ] **Step 1: Add and commit model files**
  Run:
  ```bash
  git add app/Models
  git commit -m "feat: implement Eloquent models with relationships"
  ```
