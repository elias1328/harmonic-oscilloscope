// A fake Web MIDI API: navigator.requestMIDIAccess() resolving to a MIDIAccess whose inputs can
// be driven from tests (send messages, plug and unplug devices).

export function makeFakeMidi({ devices = [{ id: 'kb1', name: 'Fake Keys 49' }], deny = false } = {}) {
  const access = {
    sysexEnabled: false,
    inputs: new Map(),
    outputs: new Map(),
    onstatechange: null
  };
  const makeInput = ({ id, name }) => ({ id, name, type: 'input', state: 'connected', connection: 'open', onmidimessage: null });
  devices.forEach(d => access.inputs.set(d.id, makeInput(d)));
  const calls = [];
  const fake = {
    access,
    calls,
    requestMIDIAccess(opts) {
      calls.push(opts);
      return deny ? Promise.reject(new DOMException('Permission denied', 'SecurityError')) : Promise.resolve(access);
    },
    send(id, bytes) {
      const input = access.inputs.get(id);
      if (input && input.onmidimessage) input.onmidimessage({ data: Uint8Array.from(bytes), target: input });
    },
    plug(id, name) {
      const port = makeInput({ id, name });
      access.inputs.set(id, port);
      if (access.onstatechange) access.onstatechange({ port });
    },
    unplug(id) {
      const port = access.inputs.get(id);
      if (!port) return;
      access.inputs.delete(id);
      port.state = 'disconnected';
      if (access.onstatechange) access.onstatechange({ port });
    }
  };
  return fake;
}
