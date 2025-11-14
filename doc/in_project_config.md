# In-Project Configuration System (.gibrun)

## Overview

The `.gibrun` directory serves as a workspace-scoped configuration and data storage system for gibRun MCP Server. It provides a structured approach to manage project-specific settings, templates, and persistent data storage within the MCP security boundaries.

**Key Features:**
- **Multi-Language Support**: Templates work with any programming language (TypeScript, Go, Python, Java, Rust, etc.)
- **Framework Agnostic**: Supports Express, Gin, Flask, Spring Boot, Axum, and any web framework
- **Auto-Detection**: Automatically detects project language and loads appropriate context variables
- **Flexible Configuration**: Customizable categories and variables for different project types

## Directory Structure

```
.gibrun/
├── config.json          # Main configuration file
├── templates/           # Code generation templates
│   ├── api/            # API endpoint templates
│   ├── database/       # Database model templates
│   ├── test/           # Test file templates
│   └── config/         # Configuration file templates
├── cache.db            # DuckDB cache database
├── project_index.db    # DuckDB project indexing database
├── todos.db           # TODO/task tracking database
└── [future files]     # Additional configuration files
```

## Configuration File (.gibrun/config.json)

### Purpose
The `config.json` file controls template system behavior and stores project metadata. It is automatically created with default values if not present.

### Schema

```json
{
  "templates": {
    "enabled": true,
    "basePath": ".gibrun/templates",
    "categories": {
      "api": {
        "description": "API endpoint templates",
        "variables": ["endpointName", "method", "path", "framework"],
        "defaultFramework": "express"
      },
      "database": {
        "description": "Database model templates",
        "variables": ["modelName", "tableName", "fields"]
      },
      "test": {
        "description": "Test file templates",
        "variables": ["testName", "targetFile"]
      },
      "config": {
        "description": "Configuration file templates",
        "variables": ["configName", "environment"]
      }
    }
  },
  "project": {
    "name": "my-project",
    "framework": "express",
    "database": "postgresql"
  }
}
```

### Configuration Fields

#### templates.enabled
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enables/disables the template system

#### templates.basePath
- **Type**: `string`
- **Default**: `".gibrun/templates"`
- **Description**: Base path for template storage relative to workspace root

#### templates.categories
- **Type**: `object`
- **Description**: Template categories with their configurations
- **Properties**:
  - `description`: Human-readable category description
  - `variables`: Array of required variable names for templates in this category
  - `defaultFramework`: Default framework for API templates (can be any framework from any language)

### Language-Specific Configuration Examples

#### Go Project Configuration
```json
{
  "templates": {
    "enabled": true,
    "basePath": ".gibrun/templates",
    "categories": {
      "api": {
        "description": "Go API handler templates",
        "variables": ["handlerName", "method", "path", "framework"],
        "defaultFramework": "gin"
      },
      "database": {
        "description": "Go database model templates",
        "variables": ["modelName", "tableName", "fields"]
      }
    }
  },
  "project": {
    "name": "my-go-project",
    "framework": "gin",
    "database": "postgresql"
  }
}
```

#### Python Project Configuration
```json
{
  "templates": {
    "enabled": true,
    "basePath": ".gibrun/templates",
    "categories": {
      "api": {
        "description": "Python API route templates",
        "variables": ["routeName", "method", "path", "framework"],
        "defaultFramework": "flask"
      },
      "models": {
        "description": "Python model templates",
        "variables": ["modelName", "fields", "tableName"]
      }
    }
  },
  "project": {
    "name": "my-python-project",
    "framework": "flask",
    "database": "postgresql"
  }
}
```

#### Java Project Configuration
```json
{
  "templates": {
    "enabled": true,
    "basePath": ".gibrun/templates",
    "categories": {
      "controllers": {
        "description": "Spring controller templates",
        "variables": ["controllerName", "method", "path", "entity"],
        "defaultFramework": "spring"
      },
      "entities": {
        "description": "JPA entity templates",
        "variables": ["entityName", "fields", "tableName"]
      }
    }
  },
  "project": {
    "name": "my-java-project",
    "framework": "spring-boot",
    "database": "postgresql"
  }
}
```

#### project
- **Type**: `object`
- **Description**: Project metadata used for template variable substitution
- **Properties**:
  - `name`: Project name
  - `framework`: Primary framework (express, fastify, etc.)
  - `database`: Primary database (postgresql, mysql, etc.)

### DAP Configuration Extension

The `.gibrun/config.json` can be extended with DAP (Debug Adapter Protocol) configuration for project-specific debugging settings.

#### DAP Configuration Schema

```json
{
  "dap": {
    "enabled": true,
    "server": {
      "auto_detect": true,
      "preferred_host": "127.0.0.1",
      "port_range": { "start": 40000, "end": 50000 },
      "timeout": 30000,
      "retry_attempts": 3
    },
    "debugger": {
      "language": "go",
      "type": "delve",
      "version": "latest"
    },
    "launch_configs": {
      "default": { "program": "${workspaceFolder}/cmd/main.go" },
      "test": { "mode": "test" }
    },
    "environments": {
      "development": { "breakpoints": { "exception_breakpoints": ["panic"] } },
      "production": { "enabled": false }
    }
  }
}
```

#### DAP Configuration Fields

##### dap.enabled
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enables/disables DAP configuration

##### dap.server
- **Type**: `object`
- **Description**: DAP server connection settings
- **Properties**:
  - `auto_detect`: Automatically detect running DAP servers
  - `preferred_host`: Preferred host for DAP connections
  - `port_range`: Port range for DAP server detection
  - `timeout`: Connection timeout in milliseconds
  - `retry_attempts`: Number of connection retry attempts

##### dap.debugger
- **Type**: `object`
- **Description**: Debugger-specific settings
- **Properties**:
  - `language`: Programming language (go, typescript, etc.)
  - `type`: Debugger type (delve, node, etc.)
  - `version`: Debugger version preference

##### dap.launch_configs
- **Type**: `object`
- **Description**: Launch configuration presets
- **Properties**: Custom launch configurations for different scenarios

##### dap.environments
- **Type**: `object`
- **Description**: Environment-specific DAP settings
- **Properties**: Environment-specific overrides for debugging behavior

## Template System

### Template Files
Templates are stored as `.template` files within category subdirectories. They use `${variableName}` syntax for variable substitution and support any programming language.

### Example Templates

#### API Template (.gibrun/templates/api/express-route.ts.template)
```typescript
import { Request, Response } from 'express';

export const ${endpointName}Handler = async (req: Request, res: Response) => {
  try {
    // TODO: Implement ${endpointName} logic
    const result = {
      message: '${endpointName} endpoint',
      method: '${method}',
      path: '${path}'
    };

    res.json(result);
  } catch (error) {
    console.error('Error in ${endpointName}:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
```

#### Database Template (.gibrun/templates/database/model.ts.template)
```typescript
export interface ${modelName} {
  id: string;
  ${fields}
  createdAt: Date;
  updatedAt: Date;
}

export class ${modelName}Model {
  constructor(private db: any) {}

  async findById(id: string): Promise<${modelName} | null> {
    // TODO: Implement database query
    return null;
  }

  async create(data: Omit<${modelName}, 'id' | 'createdAt' | 'updatedAt'>): Promise<${modelName}> {
    // TODO: Implement create logic
    return {
      ...data,
      id: 'generated-id',
      createdAt: new Date(),
      updatedAt: new Date()
    } as ${modelName};
  }
}
```

### Multi-Language Support

The template system supports any programming language. Here are examples for different languages:

#### Go API Handler Template (.gibrun/templates/api/go-handler.go.template)
```go
package handlers

import (
    "net/http"
    "encoding/json"
    "github.com/gorilla/mux"
)

// ${handlerName}Handler handles ${method} requests to ${path}
func ${handlerName}Handler(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)

    // TODO: Implement ${handlerName} logic
    response := map[string]interface{}{
        "message": "${handlerName} endpoint",
        "method":  "${method}",
        "path":    "${path}",
        "status":  "success",
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}
```

#### Python Flask Route Template (.gibrun/templates/api/python-flask.py.template)
```python
from flask import Blueprint, request, jsonify

${routeName}_bp = Blueprint('${routeName}', __name__)

@${routeName}_bp.route('${path}', methods=['${method}'])
def ${routeName}():
    """
    ${routeName} endpoint - ${method} ${path}
    """
    try:
        # TODO: Implement ${routeName} logic
        data = {
            "message": "${routeName} endpoint",
            "method": "${method}",
            "path": "${path}",
            "status": "success"
        }

        return jsonify(data), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
```

#### Java Spring Controller Template (.gibrun/templates/api/java-spring.java.template)
```java
package com.example.controllers;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import java.util.Map;
import java.util.HashMap;

@RestController
@RequestMapping("${path}")
public class ${controllerName}Controller {

    @${method}Mapping
    public ResponseEntity<Map<String, Object>> ${methodName}() {
        try {
            // TODO: Implement ${methodName} logic
            Map<String, Object> response = new HashMap<>();
            response.put("message", "${controllerName} endpoint");
            response.put("method", "${method}");
            response.put("path", "${path}");
            response.put("status", "success");

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
}
```

#### Rust Axum Handler Template (.gibrun/templates/api/rust-axum.rs.template)
```rust
use axum::{
    extract::Path,
    http::StatusCode,
    response::Json,
    routing::${methodLower},
    Router,
};
use serde_json::json;
use std::collections::HashMap;

pub fn ${handlerName}_routes() -> Router {
    Router::new()
        .route("${path}", ${methodLower}(${handlerName}_handler))
}

async fn ${handlerName}_handler(
    Path(params): Path<HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // TODO: Implement ${handlerName} logic

    let response = json!({
        "message": "${handlerName} endpoint",
        "method": "${method}",
        "path": "${path}",
        "status": "success"
    });

    Ok(Json(response))
}
```

### Variable Substitution

#### Built-in Variables
- `projectName`: From package.json name (Node.js) or project metadata
- `version`: From package.json version or equivalent
- `description`: From package.json description or equivalent
- `target`: From tsconfig.json compilerOptions.target (TypeScript)
- `module`: From tsconfig.json compilerOptions.module (TypeScript)
- `currentDate`: Current date in YYYY-MM-DD format
- `currentYear`: Current year

#### Language-Specific Context Variables

The system automatically detects project language and loads appropriate context variables:

**Go Projects** (go.mod detected):
- `moduleName`: From go.mod module directive
- `goVersion`: From go.mod go directive

**Python Projects** (requirements.txt, setup.py, pyproject.toml detected):
- `pythonVersion`: From runtime or configuration
- `packageName`: From setup.py name or pyproject.toml

**Java Projects** (pom.xml, build.gradle detected):
- `groupId`: From Maven pom.xml
- `artifactId`: From Maven pom.xml
- `javaVersion`: From Maven properties or Gradle

**Rust Projects** (Cargo.toml detected):
- `crateName`: From Cargo.toml package.name
- `rustVersion`: From rust-toolchain.toml or Cargo.toml

#### Template Variables
Variables are extracted automatically from template content using `${variableName}` pattern.

### Template Operations

#### List Templates
```typescript
{
  "operation": "list",
  "category": "api"  // optional, lists all if not specified
}
```

#### Apply Template
```typescript
{
  "operation": "apply",
  "template": "api/express-route.ts.template",
  "variables": {
    "endpointName": "createUser",
    "method": "POST",
    "path": "/api/users"
  },
  "output_path": "src/routes/user.routes.ts"
}
```

#### Create Template
```typescript
{
  "operation": "create",
  "category": "api",
  "template": "custom-route",
  "content": "template content with ${variables}"
}
```

#### Validate Template
```typescript
{
  "operation": "validate",
  "template": "api/express-route.ts.template"
}
```

## Database Storage

### Cache Database (.gibrun/cache.db)
- **Purpose**: High-performance caching for API responses and computed data
- **Technology**: DuckDB
- **Location**: `.gibrun/cache.db`

### Project Index Database (.gibrun/project_index.db)
- **Purpose**: Full-text search and analytics for project files, symbols, and metrics
- **Technology**: DuckDB
- **Location**: `.gibrun/project_index.db`

### TODO Database (.gibrun/todos.db)
- **Purpose**: Task and TODO tracking across sessions
- **Technology**: DuckDB
- **Location**: `.gibrun/todos.db`

## Implementation Details

### Security Considerations
- All file operations are validated to stay within workspace boundaries
- Template content is sanitized before processing
- Database files are created with appropriate permissions

### Auto-Initialization
- `.gibrun/config.json` is created automatically with defaults if missing
- Template directories are created on first use
- Database files are initialized when first accessed

### Integration Points
- **Template Manager**: `src/tools/file-system/template-manager.ts`
- **DAP Configuration**: `src/core/dap-config-manager.ts` (planned)
- **DuckDB Cache**: `src/core/duckdb-cache-manager.ts`
- **Project Index**: `src/core/duckdb-manager.ts`
- **Incremental Updater**: Excludes `.gibrun` from file scanning

## Usage Examples

### Basic Template Usage
```bash
# List available API templates
AI: "Show me available API templates"

# Generate an Express route
AI: "Create an Express route for user creation at /api/users"

# Generate a database model
AI: "Create a User model with fields: name, email, age"
```

### Multi-Language Template Usage
```bash
# Go project
AI: "Create a Gin handler for user registration at /api/users/register"

# Python project
AI: "Generate a Flask route for product listing at /api/products"

# Java project
AI: "Create a Spring controller for order management at /api/orders"

# Rust project
AI: "Generate an Axum handler for authentication at /api/auth/login"
```

### Testing Multi-Language Templates
```bash
# Test Go template generation
AI: "Apply the go-gin-handler template with handlerName=createUser, method=POST, path=/api/users"

# Test Python template generation
AI: "Apply the python-flask-route template with routeName=get_products, method=GET, path=/api/products"

# Test Java template generation
AI: "Apply the java-spring-controller template with controllerName=Order, methodName=getOrders, method=GET, path=/api/orders"
```

### Configuration Management
```bash
# View current configuration
AI: "Show me the current .gibrun configuration"

# Update project settings
AI: "Update project framework to fastify and database to mysql"
```

## Best Practices

### Template Organization
- Use descriptive category names
- Include comprehensive variable lists in configuration
- Add comments in templates for complex logic
- Version control templates with project code
- Organize templates by language/framework subdirectories

### Multi-Language Best Practices
- **Language Detection**: System auto-detects based on project files (go.mod, package.json, pom.xml, etc.)
- **Framework-Specific Categories**: Create categories specific to your framework (gin, flask, spring, etc.)
- **Variable Naming**: Use consistent variable names across languages where possible
- **File Extensions**: Include appropriate file extensions in template names (.go, .py, .java, .rs)
- **Import Statements**: Include common imports in templates to reduce manual editing
- **Error Handling**: Include language-appropriate error handling patterns
- **Documentation**: Add language-specific comments and documentation standards

### Configuration Management
- Keep configuration in version control
- Use environment-specific overrides when needed
- Document custom variables in template comments
- Regularly review and update template categories

### Performance Considerations
- Database files are optimized for the specific use case
- Template processing is cached where possible
- File operations respect workspace boundaries for security

## Troubleshooting

### Common Issues

#### Templates not found
- Ensure `.gibrun/templates/` directory exists
- Check template file naming (must end with `.template`)
- Verify configuration is valid JSON

#### Variable substitution fails
- Check that all required variables are provided
- Verify variable names match template syntax `${variableName}`
- Ensure context variables are available (package.json, tsconfig.json)

#### Database initialization fails
- Check write permissions for `.gibrun/` directory
- Ensure DuckDB dependencies are installed
- Verify database paths are correct

#### DAP configuration issues
- Ensure DAP config follows the correct schema
- Check that environment names match between configurations
- Verify debugger type is supported for the language
- Test DAP server auto-detection with manual port specification

#### Multi-language template issues
- **Language not detected**: Ensure project has appropriate marker files (go.mod, package.json, pom.xml, etc.)
- **Wrong template applied**: Check that template variables match the target language syntax
- **Import errors**: Verify that template includes necessary imports for the target framework
- **File extension mismatch**: Ensure template filename includes correct extension (.go, .py, .java, .rs)
- **Variable substitution fails**: Check that all required variables are provided and match template syntax

### Debug Commands
```bash
# Validate template configuration
AI: "Validate the template configuration"

# Check template variables
AI: "Show variables required for api/express-route template"

# List all templates
AI: "List all available templates"
```

## Future Enhancements

### Planned Features
- Template sharing between projects
- Template marketplace integration
- Advanced variable validation
- Template dependency management
- GUI template editor
- **Language-specific template packs**: Pre-built templates for popular frameworks
- **Template testing framework**: Automated validation of generated code
- **Template versioning**: Version control for template evolution
- **Community template repository**: Shared templates across organizations

### Configuration Extensions
- Environment-specific configurations
- User preferences and shortcuts
- Integration with external template repositories
- Template usage analytics

---

**Version**: 1.0.0
**Last Updated**: November 2025
**Related Files**:
- `src/tools/file-system/template-manager.ts`
- `src/core/dap-config-manager.ts` (planned)
- `src/core/duckdb-cache-manager.ts`
- `src/core/duckdb-manager.ts`

**Related Documentation**:
- `doc/dap_configuration_implementation.md` - DAP configuration details
- `doc/file_handler.md` - Template system implementation
- `doc/feat_duckdb_cache.md` - Cache system design
- `doc/duckdb_indexing_implementation.md` - Project indexing