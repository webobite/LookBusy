# Spec Delta

## Purpose

Defines what LookBusy records in Notion for each completed interval: the session's properties, its description, the daily streak, the device it was logged from and its link to a per-day summary row, across both the current and the legacy database schemas.

## ADDED Requirements

### Requirement: Session properties on the current schema
For a sessions database with the current schema, each completed interval SHALL be logged with:
- `Task`: the task label, or a default when it is blank
- `Description`
- `Session Type`
- `Status` = Completed
- `Start` and `End`: date and time in ISO 8601
- `Streak`
- `Device` and `Device ID`: this device's name and stable ID

#### Scenario: Focus session completes
- **WHEN** a Focus interval labelled "Write report" runs from 09:00 to 09:25 and completes
- **THEN** a row is created with `Task` = "Write report", `Session Type` = Focus, `Status` = Completed, `Start` = 09:00 and `End` = 09:25 on that date

#### Scenario: Blank task label
- **WHEN** an interval completes with an empty task label
- **THEN** `Task` is set to the session type label followed by "(unnamed, suspiciously)", as today

### Requirement: Optional session description
The popup SHALL offer an optional multi-line Description field. Its value SHALL be kept alongside the task label across popup closes and logged in the `Description` property.

#### Scenario: Description entered
- **WHEN** the user types "Draft section 2" in Description and the interval completes
- **THEN** the logged row's `Description` is "Draft section 2"

#### Scenario: Description left empty
- **WHEN** the Description field is empty
- **THEN** the row is logged with an empty `Description`, and no error occurs

### Requirement: Daily streak
The system SHALL keep a daily streak: the number of consecutive local calendar days, ending with the current one, that each have at least one completed Focus session. Every logged row SHALL carry the streak as it stands once that row is counted.

#### Scenario: Consecutive day
- **WHEN** the previous Focus session completed yesterday with streak 4, and the first Focus of today completes
- **THEN** that row and later rows today have `Streak` = 5

#### Scenario: Same day
- **WHEN** a second Focus completes on a day whose streak is 5
- **THEN** its `Streak` is 5

#### Scenario: Gap of a day or more
- **WHEN** the last Focus session completed two or more days ago and a Focus completes today
- **THEN** its `Streak` is 1

#### Scenario: Break before any focus today
- **WHEN** a break completes on a day with no completed Focus yet, and yesterday had one with streak 4
- **THEN** the break row's `Streak` is 4, because the streak is not yet broken

#### Scenario: Break after a broken streak
- **WHEN** a break completes, there has been no Focus today, and the last Focus was two or more days ago
- **THEN** the break row's `Streak` is 0

### Requirement: Device identity
Each install SHALL have a user-chosen device name and a randomly generated device ID. Both SHALL be stored only on that device and never synced. Settings SHALL require a non-empty device name to save. The ID SHALL be generated once and never change or be shown for editing.

#### Scenario: First save on a device
- **WHEN** the user enters "Work laptop" as the device name and saves for the first time on this device
- **THEN** the name is saved, a new device ID is generated, and both are stored on this device only

#### Scenario: Missing device name
- **WHEN** the user tries to save Settings with an empty device name
- **THEN** nothing is saved and the page says that a device name is required

#### Scenario: Second device on the same Chrome profile
- **WHEN** the user signs into the same Chrome profile on another computer
- **THEN** that computer has no device name or ID yet, and asks for its own name

#### Scenario: Logging before a name is set
- **WHEN** an interval completes on a `v2` database and no device name has been saved on this device
- **THEN** the row is logged with `Device` and `Device ID` left empty, and logging otherwise succeeds

### Requirement: Device name on every log
For a `v2` sessions database, every logged session SHALL carry this device's current name in `Device` and its ID in `Device ID`.

#### Scenario: Session logged from a named device
- **WHEN** the device is named "Work laptop" and an interval completes
- **THEN** the row has `Device` = "Work laptop" and `Device ID` = this device's ID

### Requirement: Device rename updates past records
When the user saves a different device name, the system SHALL set `Device` to the new name on every row in the sessions database whose `Device ID` equals this device's ID. Rows from other devices SHALL NOT change.

#### Scenario: Rename with existing history
- **WHEN** 40 rows have this device's ID with `Device` = "Work laptop", and the user renames the device to "Office Mac"
- **THEN** all 40 rows show `Device` = "Office Mac", and new sessions log as "Office Mac"

#### Scenario: Another device shares the old name
- **WHEN** a different device is also named "Work laptop" and this device is renamed
- **THEN** only rows with this device's `Device ID` change

#### Scenario: Progress and completion
- **WHEN** a rename is in progress
- **THEN** Settings shows how many rows have been updated so far, and shows a completion message when every matching row has been updated

#### Scenario: Interrupted rename
- **WHEN** the browser closes, the network drops or Notion returns an error partway through
- **THEN** the rename stays pending and resumes automatically, without user action, on the next browser start or within a few minutes, until every matching row has been updated

#### Scenario: Renamed again before finishing
- **WHEN** the user renames the device again while a rename is still pending
- **THEN** the pending rename switches to the latest name, and all matching rows end with the latest name

#### Scenario: Legacy or unconfigured database
- **WHEN** the configured database is `v1`, or no database is configured
- **THEN** the new name is saved and no Notion rows are updated

### Requirement: Day linking
When a daily database is configured, each logged session SHALL be linked through `Day` to the daily row for the local calendar date on which the interval started. The system SHALL create that row, titled `YYYY-MM-DD` and with `Date` set to that day, if it does not exist yet.

#### Scenario: First session of the day
- **WHEN** the first interval of 2026-10-06 completes and no daily row for that date exists
- **THEN** a daily row titled "2026-10-06" is created, and the session row links to it

#### Scenario: Later sessions of the day
- **WHEN** another interval that started on 2026-10-06 completes
- **THEN** it links to the existing "2026-10-06" row and no duplicate daily row is created

#### Scenario: Interval crosses midnight
- **WHEN** an interval starts at 23:50 and ends at 00:15
- **THEN** it links to the daily row of the day it started

#### Scenario: Daily row unavailable
- **WHEN** finding or creating the daily row fails
- **THEN** the session is still logged without a `Day` link, and the failure is reported like other logging errors

### Requirement: Schema version detection
When a sessions database ID is saved, the system SHALL read the database's properties and record its schema version: `v2` if it has a `Task` title and both `Start` and `End` date properties, otherwise `v1`. If no version is recorded, the system SHALL treat the database as `v1`.

#### Scenario: Database created by setup
- **WHEN** setup creates the databases
- **THEN** the schema version is recorded as `v2` without a separate read

#### Scenario: Unreadable database on save
- **WHEN** the database cannot be read while saving, for example because it is not shared with the integration
- **THEN** settings are still saved, the version falls back to `v1`, and the Notion error is shown

### Requirement: Legacy schema compatibility
For a `v1` sessions database, the system SHALL log with the original properties: `Name` (Title), `Date` (start to end range), `Session Type` and `Status`. It SHALL NOT send `Description`, `Streak`, `Start`, `End`, `Day`, `Device` or `Device ID`.

#### Scenario: Existing hand-built database
- **WHEN** a user with a database built from the old README schema completes an interval after upgrading
- **THEN** the row is logged exactly as before the upgrade, and no validation error occurs
