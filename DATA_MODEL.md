# Data Model

## Users
- id (uuid)
- email
- name
- createdAt

## Sessions
- id
- userId
- createdAt
- expiresAt

## OAuthTokens
- id
- userId
- provider (google)
- encryptedAccessToken
- encryptedRefreshToken
- keyVersion
- expiresAt

## Entries
- id
- userId
- title
- status (processing|ready|error)
- driveWriteStatus (ok|pending|failed)
- driveFileId
- summaryMarkdown
- keyPoints (json array)
- metadataRefs (json array)
- createdAt
- updatedAt

## Prompts
- id
- key
- version
- content
- active (bool)
- userSelectable (bool)
- createdAt

## IndexPacks
- id
- userId
- driveFileId
- status
- createdAt

