# TRE - Trusted Research Environment

## Overview

TRE is a full-stack web application designed to provide a secure, managed environment for researchers to run computational jobs against GitHub repositories. The system implements a multi-tenant architecture with user approval workflows, workspace management, and job execution tracking.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query for server state management
- **UI Framework**: Radix UI components with Tailwind CSS styling
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ESM modules
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: GitHub OAuth integration
- **Session Management**: Express sessions with PostgreSQL storage

### Data Storage
- **Database**: PostgreSQL (configured for Neon serverless)
- **ORM**: Drizzle ORM with schema-first approach
- **Migration Strategy**: Drizzle Kit for database migrations
- **Connection**: Connection pooling with @neondatabase/serverless

## Key Components

### Authentication System
- **OAuth Provider**: GitHub OAuth for user authentication
- **Approval Workflow**: Three-tier user approval system (pending, approved, rejected)
- **Role-Based Access**: User and staff roles with different permissions
- **Session Management**: Server-side sessions with PostgreSQL storage

### User Management
- **User Registration**: Automatic user creation via GitHub OAuth
- **Approval Process**: Staff members can approve/reject user requests
- **Profile Management**: Users can provide research context and institutional affiliation

### Workspace Management
- **GitHub Integration**: Direct integration with GitHub repositories
- **Branch Selection**: Users can select specific branches for their workspaces
- **Workspace Lifecycle**: Creation, management, and deletion of research workspaces
- **Commit Tracking**: Automatic tracking of repository commits

### Job Request System
- **Job Submission**: Users can submit computational jobs for their workspaces
- **Status Tracking**: Real-time job status monitoring (queued, running, completed, failed)
- **Result Management**: Job output and result file handling
- **Historical Tracking**: Complete audit trail of job executions

## Data Flow

1. **User Authentication**: Users authenticate via GitHub OAuth
2. **Approval Process**: New users submit approval requests reviewed by staff
3. **Workspace Creation**: Approved users create workspaces linked to GitHub repositories
4. **Job Submission**: Users submit jobs against their workspaces
5. **Job Processing**: System processes jobs and tracks execution status
6. **Result Retrieval**: Users can view job results and download outputs

## External Dependencies

### GitHub Integration
- **OAuth Application**: Requires GitHub OAuth app configuration
- **API Access**: Uses GitHub API for repository and user data
- **Repository Access**: Integrates with both public and private repositories

### Database Services
- **Neon Database**: PostgreSQL serverless database platform
- **Connection Pooling**: Managed connection pooling for scalability

### UI Components
- **Radix UI**: Accessible component primitives
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide Icons**: Icon library for UI elements

## Deployment Strategy

### Development Environment
- **Hot Reload**: Vite development server with HMR
- **TypeScript**: Full TypeScript support with type checking
- **Database**: Local or cloud PostgreSQL instance

### Production Build
- **Static Assets**: Vite builds optimized client bundle
- **Server Bundle**: ESBuild compiles server code
- **Environment Variables**: GitHub OAuth credentials and database URL required

### Environment Configuration
- **GitHub OAuth**: CLIENT_ID and CLIENT_SECRET required
- **Database**: DATABASE_URL for PostgreSQL connection
- **Session**: Secure session configuration for production

## User Preferences

Preferred communication style: Simple, everyday language.

## Changelog

Changelog:
- July 07, 2025. Initial setup