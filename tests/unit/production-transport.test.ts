import { Socket } from "node:net";
import { TLSSocket, type PeerCertificate } from "node:tls";
import { afterEach, expect, it, vi } from "vitest";
import { assertProductionTransport, productionTarget } from "../../scripts/production-target";

const target = productionTarget({ NODE_ENV: "production", P8_PRODUCTION_HOST: "ep-approved-123.us-east-2.aws.neon.tech" }, "status");
const sockets: Socket[] = [];
afterEach(() => { for (const socket of sockets.splice(0)) socket.destroy(); vi.restoreAllMocks(); });
function transport(host: string) {
  const socket = new TLSSocket(new Socket()); sockets.push(socket);
  // Model a completed native TLS handshake; live validation is separately probed.
  Object.defineProperty(socket, "authorized", { value: true, configurable: true });
  vi.spyOn(socket, "getPeerCertificate").mockReturnValue({ subjectaltname: `DNS:${host}` } as PeerCertificate);
  return socket;
}
it("rejects plaintext and objects that merely claim to have verified TLS", () => {
  const socket = new Socket(); sockets.push(socket);
  for (const value of [undefined, socket, { encrypted: true, authorized: true }]) expect(() => assertProductionTransport(target, value)).toThrow("certificate-verified");
});
it("rejects an encrypted transport with an unauthorized certificate", () => {
  const socket = new TLSSocket(new Socket()); sockets.push(socket);
  expect(() => assertProductionTransport(target, socket)).toThrow("certificate-verified");
});
it("rejects a trusted certificate for a different hostname", () => {
  expect(() => assertProductionTransport(target, transport("other.neon.tech"))).toThrow("certificate-verified");
});
it("accepts verified native TLS only for the approved hostname", () => {
  expect(() => assertProductionTransport(target, transport(target.host))).not.toThrow();
});
