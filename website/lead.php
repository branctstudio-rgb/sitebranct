<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

function reply(int $status): never {
    http_response_code($status);
    echo json_encode(['success' => $status === 200]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    reply(405);
}
if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') reply(415);
if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') reply(403);
$raw = file_get_contents('php://input', false, null, 0, 8193);
if (strlen($raw) > 8192) reply(413);
$data = json_decode($raw, true);
if (!is_array($data) || ($data['consent'] ?? null) !== true ||
    !in_array($data['locale'] ?? '', ['pt-PT', 'it-IT', 'en'], true) || !empty($data['website_url'])) reply(422);

function field(array $data, string $key, int $max, bool $required = true): string {
    $value = $data[$key] ?? '';
    if (!is_string($value)) reply(422);
    $value = trim($value);
    if (($required && $value === '') || strlen($value) > $max || preg_match('/[[:cntrl:]]/', $value)) reply(422);
    return $value;
}

$name = field($data, 'name', 160);
$email = field($data, 'email', 254);
if (strlen($name) < 2 || !filter_var($email, FILTER_VALIDATE_EMAIL)) reply(422);
$phone = field($data, 'phone', 40, false);
$company = field($data, 'company', 240, false);
$brief = ['Idioma: ' . $data['locale']];
foreach (['siteType' => 'Website', 'sector' => 'Setor', 'goal' => 'Objetivo', 'timeline' => 'Prazo'] as $key => $label) {
    $brief[] = $label . ': ' . field($data, $key, 240);
}
$attribution = [];
foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id'] as $key) {
    $value = field($data, $key, 400, false);
    if ($value !== '') {
        $attribution[$key] = $value;
        $brief[] = $key . ': ' . $value;
    }
}
$brief[] = 'Pedido de contacto confirmado no formulário /website/.';

// The existing public forms use the same site identifier. Read their deployed
// configuration locally, including the minified form produced by the FTP build.
$token = getenv('BRANCT_SITE_LEAD_TOKEN') ?: '';
if ($token === '') {
    $bundle = @file_get_contents(dirname(__DIR__) . '/src/js/branct.js');
    $pattern = '~https://n8n\.branct\.com/webhook/site-lead["\'][;,]\s*(?:var\s+|let\s+|const\s+)?[\w$]+\s*=\s*["\']([a-f0-9-]{36})~i';
    if (!$bundle || !preg_match($pattern, $bundle, $match)) reply(503);
    $token = $match[1];
}
$payload = $attribution + ['nome' => $name, 'email' => $email, 'telefone' => $phone,
    'empresa' => $company, 'interesse' => 'Website', 'mensagem' => implode("\n", $brief),
    'origem' => 'Website / Quiz', 'source' => 'website-quiz', 'token' => $token];

// Fixed private buckets limit disk use. Keep only timestamps and hashes outside
// the web root; locking also prevents simultaneous double submission.
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$peer = hash('sha256', $ip);
$dir = sys_get_temp_dir() . '/branct-website-' . substr(hash('sha256', __DIR__), 0, 16);
if (!is_dir($dir) && !@mkdir($dir, 0700) && !is_dir($dir)) reply(503);
$file = @fopen($dir . '/' . substr($peer, 0, 3), 'c+');
if (!$file || !flock($file, LOCK_EX)) reply(503);
$now = time();
$records = json_decode(stream_get_contents($file), true) ?: [];
foreach ($records as $key => $record) {
    if ($record['time'] < $now - 600) unset($records[$key]);
}
$id = hash('sha256', json_encode($payload));
if (($records[$id]['ok'] ?? false) === true) reply(200);
$count = 0;
foreach ($records as $record) if ($record['peer'] === $peer) $count += $record['attempts'];
if ($count >= 10) {
    header('Retry-After: 600');
    reply(429);
}
$records[$id] = ['time' => $now, 'peer' => $peer, 'attempts' => ($records[$id]['attempts'] ?? 0) + 1, 'ok' => false];

function persist($file, array $records): void {
    rewind($file);
    if (!ftruncate($file, 0) || fwrite($file, json_encode($records)) === false || !fflush($file)) reply(503);
}
persist($file, $records);
$url = 'https://n8n.branct.com/webhook/site-lead';
if (PHP_SAPI === 'cli-server' && getenv('BRANCT_QUIZ_TEST_WEBHOOK')) $url = getenv('BRANCT_QUIZ_TEST_WEBHOOK');
$request = curl_init($url);
curl_setopt_array($request, [
    CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_TIMEOUT => 12,
    CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false,
]);
$result = curl_exec($request);
$status = curl_getinfo($request, CURLINFO_RESPONSE_CODE);
$accepted = json_decode(is_string($result) ? $result : '', true);
if ($status < 200 || $status >= 300 || ($accepted['success'] ?? false) !== true) reply(502);
$records[$id]['ok'] = true;
persist($file, $records);
reply(200);
