<?php

namespace Tests\Unit;

use App\Services\Ocr\ShelfTagOcrService;
use Symfony\Component\Process\Exception\ProcessTimedOutException;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class ShelfTagOcrServiceTest extends TestCase
{
    public function test_process_launcher_limits_threads_without_changing_parent_environment(): void
    {
        $service = new class extends ShelfTagOcrService {
            public function threadLimit(): string
            {
                return $this->runProcess([PHP_BINARY, '-r', 'echo getenv("OMP_THREAD_LIMIT");'], 5);
            }
        };
        $previous = getenv('OMP_THREAD_LIMIT');
        putenv('OMP_THREAD_LIMIT=4');
        try {
            $this->assertSame('1', $service->threadLimit());
            $this->assertSame('4', getenv('OMP_THREAD_LIMIT'));
        } finally {
            putenv($previous === false ? 'OMP_THREAD_LIMIT' : 'OMP_THREAD_LIMIT='.$previous);
        }
    }

    public function test_ocr_unavailable_when_tesseract_config_missing(): void
    {
        config(['services.tesseract.path' => null]);

        $service = new ShelfTagOcrService();
        $result = $service->scan('/tmp/dummy.png');

        $this->assertEquals('OCR_UNAVAILABLE', $result['status']);
        $this->assertEquals('', $result['raw_text']);
        $this->assertEmpty($result['lines']);
        $this->assertEmpty($result['words']);
    }

    public function test_ocr_unavailable_when_tesseract_binary_path_invalid(): void
    {
        config(['services.tesseract.path' => '/invalid/path/to/tesseract_executable_does_not_exist']);

        $service = new ShelfTagOcrService();
        $result = $service->scan('/tmp/dummy.png');

        $this->assertEquals('OCR_UNAVAILABLE', $result['status']);
        $this->assertEquals('', $result['raw_text']);
        $this->assertEmpty($result['lines']);
        $this->assertEmpty($result['words']);
    }

    public function test_tsv_output_parsing_with_confidence_filtering_and_bounding_boxes(): void
    {
        $tsvData = implode("\n", [
            "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
            "1\t1\t0\t0\t0\t0\t0\t0\t600\t400\t-1\t",
            "2\t1\t1\t0\t0\t0\t20\t30\t500\t100\t-1\t",
            "5\t1\t1\t1\t1\t1\t20\t30\t100\t40\t95.6\tSABA",
            "5\t1\t1\t1\t1\t2\t130\t30\t120\t40\t88.0\tSARDINES",
            "5\t1\t1\t1\t1\t3\t260\t30\t60\t40\t45.0\tLOWCONF",
            "5\t1\t1\t1\t2\t1\t20\t80\t80\t40\t92.0\t155g",
            "5\t1\t1\t1\t3\t1\t20\t130\t90\t40\t91.2\tP23.50",
        ]);

        $service = new ShelfTagOcrService();
        $result = $service->parseTsvOutput($tsvData);

        $this->assertEquals('OCR_SUCCESS', $result['status']);
        $this->assertEquals("SABA SARDINES\n155g\nP23.50", $result['raw_text']);
        $this->assertCount(3, $result['lines']);
        $this->assertEquals(['SABA SARDINES', '155g', 'P23.50'], $result['lines']);

        $this->assertCount(4, $result['words']);
        $this->assertEquals([
            'text' => 'SABA',
            'confidence' => 96,
            'left' => 20,
            'top' => 30,
            'width' => 100,
            'height' => 40,
            'line_num' => 1,
            'block_num' => 1,
        ], $result['words'][0]);

        $this->assertEquals('P23.50', $result['words'][3]['text']);
        $this->assertEquals(91, $result['words'][3]['confidence']);
    }

    public function test_ocr_no_text_when_tsv_has_no_words_above_confidence_threshold(): void
    {
        $tsvData = implode("\n", [
            "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
            "5\t1\t1\t1\t1\t1\t20\t30\t100\t40\t59.9\tLOWCONF1",
            "5\t1\t1\t1\t1\t2\t130\t30\t120\t40\t40.0\tLOWCONF2",
        ]);

        $service = new ShelfTagOcrService();
        $result = $service->parseTsvOutput($tsvData);

        $this->assertEquals('OCR_NO_TEXT', $result['status']);
        $this->assertEquals('', $result['raw_text']);
        $this->assertEmpty($result['lines']);
        $this->assertEmpty($result['words']);
    }

    public function test_ocr_timeout_when_process_times_out(): void
    {
        config(['services.tesseract.path' => 'tesseract']);

        $mockProcess = new Process(['tesseract']);
        $timeoutException = new ProcessTimedOutException($mockProcess, ProcessTimedOutException::TYPE_GENERAL);

        $service = new class($timeoutException) extends ShelfTagOcrService {
            public function __construct(private ProcessTimedOutException $exception) {}

            protected function runProcess(array $command, int $timeout): string
            {
                throw $this->exception;
            }
        };

        $result = $service->scan('/tmp/dummy.png');

        $this->assertEquals('OCR_TIMEOUT', $result['status']);
        $this->assertEquals('', $result['raw_text']);
        $this->assertEmpty($result['lines']);
        $this->assertEmpty($result['words']);
    }

    public function test_ocr_failed_on_process_runtime_error(): void
    {
        config(['services.tesseract.path' => 'tesseract']);

        $service = new class extends ShelfTagOcrService {
            protected function runProcess(array $command, int $timeout): string
            {
                throw new \RuntimeException('Process crashed unexpectedly');
            }
        };

        $result = $service->scan('/tmp/dummy.png');

        $this->assertEquals('OCR_FAILED', $result['status']);
        $this->assertEquals('', $result['raw_text']);
        $this->assertEmpty($result['lines']);
        $this->assertEmpty($result['words']);
    }

    public function test_process_method_alias_behaves_identically_to_scan(): void
    {
        config(['services.tesseract.path' => null]);

        $service = new ShelfTagOcrService();
        $result = $service->process('/tmp/dummy.png');

        $this->assertEquals('OCR_UNAVAILABLE', $result['status']);
    }

    public function test_configurable_confidence_floor_preserves_useful_matching_tokens(): void
    {
        $service = new ShelfTagOcrService();
        $tsv = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"
            . "5\t1\t1\t1\t1\t1\t10\t10\t80\t20\t45\tNESC\n";

        $result = $service->parseTsvOutput($tsv, 30);

        $this->assertSame('OCR_SUCCESS', $result['status']);
        $this->assertSame('NESC', $result['words'][0]['text']);
        $this->assertSame(45, $result['words'][0]['confidence']);
    }

    public function test_per_pass_options_control_segmentation_timeout_and_confidence_floor(): void
    {
        config(['services.tesseract.path' => 'tesseract']);
        $service = new class extends ShelfTagOcrService {
            public array $capturedCommand = [];
            public int $capturedTimeout = 0;

            protected function runProcess(array $command, int $timeout): string
            {
                $this->capturedCommand = $command;
                $this->capturedTimeout = $timeout;

                return "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"
                    . "5\t1\t1\t1\t1\t1\t10\t10\t80\t20\t45\tNESC\n";
            }
        };

        $result = $service->extractText('tag.png', [
            'psm' => 6,
            'timeout_seconds' => 3,
            'minimum_confidence' => 30,
        ]);

        $this->assertSame('OCR_SUCCESS', $result['status']);
        $this->assertSame(3, $service->capturedTimeout);
        $this->assertSame(['tesseract', 'tag.png', 'stdout', '--psm', '6', '-l', 'eng', 'tsv'], $service->capturedCommand);
    }
}
