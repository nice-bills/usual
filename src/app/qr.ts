/** A wallet QR can be a bare address or wrapped in a link. Take only the address. */
export function addressIn(scanned: string) {
  return scanned.match(/0x[0-9a-fA-F]{64}/)?.[0] ?? null;
}
