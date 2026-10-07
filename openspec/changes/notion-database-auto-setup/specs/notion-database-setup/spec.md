# Spec Delta

## Purpose

Lets a user get correctly structured Notion databases for session logging and daily summaries in one approved action, instead of building the schemas by hand and copying IDs into Settings.

## ADDED Requirements

### Requirement: Setup action availability
The Settings page SHALL offer a "Create databases for me" action only when an integration secret and a device name are both entered and no sessions database ID is configured.

#### Scenario: Secret and device name entered, no database configured
- **WHEN** the user has entered an integration secret and a device name, and the sessions database ID field is empty
- **THEN** the "Create databases for me" action is shown and enabled

#### Scenario: No secret entered
- **WHEN** the integration secret field is empty
- **THEN** the action is disabled and a hint says that a secret is required first

#### Scenario: No device name entered
- **WHEN** the device name field is empty or only whitespace
- **THEN** the action is disabled and a hint says that a device name is required first

#### Scenario: Database already configured
- **WHEN** a sessions database ID is saved in settings
- **THEN** the action is not offered, and the page explains that the user must clear the database ID to create new databases

### Requirement: Parent page selection
The system SHALL list the Notion pages shared with the integration and require the user to choose one as the parent of both new databases.

#### Scenario: Pages are available
- **WHEN** the user starts the setup action and the integration can see one or more pages
- **THEN** the user is shown those pages by title and can select exactly one

#### Scenario: No pages are shared
- **WHEN** the integration can see no pages
- **THEN** nothing is created, and the user is told to share a page with the integration via `•••` → Connections and then retry

#### Scenario: Invalid secret
- **WHEN** Notion rejects the integration secret
- **THEN** nothing is created and the error says the secret is invalid

### Requirement: Explicit approval before creation
The system MUST show a summary of what will be created and MUST NOT send any create request to Notion until the user explicitly confirms. The summary covers both database titles, the parent page and every column of each database with its type and options.

#### Scenario: User approves
- **WHEN** the user reviews the summary and confirms
- **THEN** the system creates both databases

#### Scenario: User cancels
- **WHEN** the user cancels at the approval step
- **THEN** no request that creates or modifies anything is sent to Notion and settings are unchanged

### Requirement: Sessions database schema
The sessions database SHALL be titled "LookBusy Sessions" and SHALL have exactly these properties:
- `Task` (Title)
- `Description` (Text)
- `Session Type` (Select: Focus, Short Break, Long Break)
- `Status` (Select: Completed)
- `Start` (Date)
- `End` (Date)
- `Streak` (Number)
- `Day` (Relation to the daily database)
- `Focus Count` (Formula: 1 for Focus, else 0)
- `Device` (Select, with no predefined options)
- `Device ID` (Text)

#### Scenario: Schema contents
- **WHEN** the user opens the sessions database in Notion
- **THEN** it shows the eleven properties with the names, types and options listed above, and no others

#### Scenario: Schema matches session logging
- **WHEN** the sessions database is used as the logging target
- **THEN** every completed Focus, Short Break and Long Break interval is logged without a Notion validation error

### Requirement: Daily summary database schema
The daily database SHALL be titled "LookBusy Daily Summary" and SHALL have these properties:
- `Day` (Title)
- `Date` (Date)
- `Sessions` (Relation, the other side of the sessions database's `Day`)
- `Focus Pomodoros` (Rollup: sum of `Focus Count`)
- `Total Sessions` (Rollup: count of `Sessions`)

#### Scenario: Focus count per day
- **WHEN** a day has three completed Focus sessions and two breaks linked to its row
- **THEN** that row shows `Focus Pomodoros` = 3 and `Total Sessions` = 5

#### Scenario: Rows edited in Notion
- **WHEN** the user deletes one of that day's Focus session rows in Notion
- **THEN** `Focus Pomodoros` for that day drops to 2 without any action by the extension

### Requirement: Atomic two-database setup
Setup SHALL either produce both databases or leave none behind: if the daily database cannot be created after the sessions database was, the system SHALL remove the sessions database and report the error.

#### Scenario: Second creation fails
- **WHEN** the sessions database is created but creating the daily database returns an error
- **THEN** the sessions database is moved to Notion's trash, no IDs are saved, the Notion error is shown, and the user can retry

#### Scenario: Rollback itself fails
- **WHEN** removing the sessions database also fails
- **THEN** no IDs are saved, and the error names the leftover "LookBusy Sessions" database so the user can delete it by hand

### Requirement: Automatic settings wiring
After a successful setup, the system SHALL save both database IDs, the integration secret used to create them, the device name and the new-schema marker to settings, without the user copying or pasting any ID. The sound preference stays unchanged.

#### Scenario: Successful creation
- **WHEN** Notion confirms that both databases were created
- **THEN** both IDs are saved and shown in the Settings page, and a success message links to each database in Notion

### Requirement: One-time creation
The system SHALL run at most one setup per confirmed approval and SHALL prevent duplicate creation while a request is in flight or a sessions database is configured.

#### Scenario: Repeated clicks
- **WHEN** the user clicks confirm more than once before setup finishes
- **THEN** only one pair of databases is created

#### Scenario: Revisiting Settings after setup
- **WHEN** the user reopens Settings after a successful setup
- **THEN** the setup action is not offered because a sessions database ID is configured

### Requirement: Manual configuration remains supported
The system SHALL keep accepting a manually entered sessions database ID or URL, plus an optional daily database ID or URL, as an alternative to automatic setup.

#### Scenario: User pastes an existing database
- **WHEN** the user pastes a database URL or ID and saves
- **THEN** the ID is extracted and saved, no database is created, and the database's schema version is detected (see `session-logging`)

#### Scenario: Daily database left empty
- **WHEN** the user saves with no daily database ID
- **THEN** sessions are logged without a day link and Settings saves without error
