<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Http;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Outbound HTTP must be faked explicitly; a real request (e.g. to Gemini) fails the test.
        Http::preventStrayRequests();
    }
}
