<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class HealthReadinessTest extends TestCase
{
    public function test_readiness_endpoint_reports_the_application_and_database_as_ready(): void
    {
        $response = $this->getJson('/api/health/ready');

        $response
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('status', 'ready')
            ->assertJsonPath('checks.app', 'ok')
            ->assertJsonPath('checks.database', 'ok')
            ->assertJsonStructure(['checked_at']);
    }

    public function test_readiness_endpoint_reports_a_sanitized_service_unavailable_response_when_the_database_fails(): void
    {
        DB::shouldReceive('selectOne')
            ->once()
            ->andThrow(new RuntimeException('db.internal.example password=do-not-leak'));

        $response = $this->getJson('/api/health/ready');

        $response
            ->assertStatus(503)
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('status', 'not_ready')
            ->assertJsonPath('checks.app', 'ok')
            ->assertJsonPath('checks.database', 'error')
            ->assertJsonMissing(['exception'])
            ->assertDontSee('db.internal.example')
            ->assertDontSee('do-not-leak');
    }
}
