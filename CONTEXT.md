# DOZO

DOZO turns a post-payment screen into a Google review prompt. A terminal shows a QR code, the customer scans it, and DOZO records the scan against the merchant.

## Language

### Parties and identity

**Merchant**:
A business that collects reviews. A merchant owns one Google Place ID and one or more registers.
_Avoid_: Store, shop, client, account

**Operator**:
DOZO staff who run the dashboard and issue setup codes. The demo has no merchant login.
_Avoid_: Admin, user, staff

**Register**:
A merchant's slot in DOZO, one per physical payment terminal. A register carries the label the operator sees and survives a device swap.
_Avoid_: Till, lane, slot

**Terminal**:
The physical Android device running the DOZO app. A terminal is identified by a terminal ID and bound to one register at a time.
_Avoid_: Register, device, unit

**Terminal ID**:
The stable identifier for a terminal, uppercase, 8 to 64 characters. The QR payload routes through it.
_Avoid_: Register ID, serial

### Pairing

**Pairing code**:
A one-time code the terminal generates during model A pairing so it can ask for a merchant. Model B retires it.
_Avoid_: Setup code, link code

**Setup code**:
A one-time code the dashboard issues for a register label. The terminal redeems it to bind.
_Avoid_: Pairing code, activation code, invite code

**Claim**:
The model A step where a terminal turns its pairing code into a store binding.
_Avoid_: Redeem, bind

**Redeem**:
The model B step where a terminal turns a setup code into a store binding. Redeeming deactivates the prior terminal on that register.
_Avoid_: Claim, pair, bind

**Adopt**:
An older path that bound an explicit terminal to a merchant. The model B setup-code flow replaces it.
_Avoid_: Attach, assign

### Services

**Connector**:
The thin public service that serves the QR redirect and health check and forwards scan events. Formerly the redirect server.
_Avoid_: Server, backend, edge

**Dashboard backend**:
The service that owns all persistent data and serves the merchant dashboard and the API.
_Avoid_: Server, admin, portal

### Review flow

**Scan**:
One visit to a terminal's review redirect that passes the debounce window and is recorded.
_Avoid_: Click, hit, conversion

**Debounce**:
The rule that ignores repeat scans of one terminal by one client within a short window.
_Avoid_: Dedupe, throttle

**Static review URL**:
The direct Google review link for a merchant, built from the Place ID at setup time. The app uses it when the connector is unreachable.
_Avoid_: Fallback URL, direct link

**Display config**:
The per-terminal settings the dashboard controls for the QR screen, meaning whether it shows and how long it stays.
_Avoid_: Settings, prefs

**Activation**:
Whether a terminal accepts payment handoffs. A manual launch still shows the UI so an operator can configure the device.
_Avoid_: Enrollment, enablement
