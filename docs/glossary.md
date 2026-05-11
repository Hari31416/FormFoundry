# Glossary

Terminology used throughout the FormFoundry codebase and documentation.

| Term            | Definition                                                                                   |
| :-------------- | :------------------------------------------------------------------------------------------- |
| **Artifact**    | A final generated document (e.g., a filled PDF) produced from an approved case.              |
| **Case**        | A specific instance of a form-filling process based on a template.                           |
| **Candidate**   | A value proposed by the AI extraction engine for a specific field, linked to evidence.       |
| **Evidence**    | A source of information (file upload, text note, chat answer) used to populate a case.       |
| **Field Path**  | A dot-notated string (e.g., `incident.details.location`) identifying a field in a template.  |
| **Field State** | The current metadata and resolved value for a specific field in a case.                      |
| **Intake**      | The process of ingesting evidence into the system.                                           |
| **Resolution**  | The process of selecting a final value for a field from multiple candidates or manual input. |
| **Template**    | A declarative definition of a form's schema, UI, and validation rules.                       |
| **Turn**        | A single exchange in an interactive conversation (assistant question + user answer).         |
