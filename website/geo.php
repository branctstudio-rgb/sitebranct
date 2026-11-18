<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store, max-age=0');
// Hostinger derives this server variable from the visitor IP in mod_geoip.
$country = strtoupper((string) ($_SERVER['GEOIP_COUNTRY_CODE'] ?? getenv('GEOIP_COUNTRY_CODE') ?: ''));
echo json_encode(['country' => in_array($country, ['PT', 'IT'], true) ? $country : null]);
