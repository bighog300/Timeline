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
- startDate
- endDate (nullable)
- tags (string array)
- summaryMarkdown
- keyPoints (json array)
- metadataRefs (json array)
- createdAt
- updatedAt

## EntrySourceRefs
- id
- entryId
- sourceType (gmail|drive)
- sourceId (messageId/fileId)
- subject/from/date (gmail metadata)
- internalDate (gmail metadata)
- name/mimeType/createdTime/modifiedTime/size (drive metadata)
- createdAt

## Prompts
- id
- key
- version
- content
- model
- maxTokens
- active (bool)
- userSelectable (bool)
- createdAt

## IndexPacks
- id
- userId
- driveFileId
- status
- createdAt
