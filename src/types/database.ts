// Fichier GÉNÉRÉ par scripts/db/gen-types.mjs — ne pas modifier à la main.
// Régénérer avec : npm run db:types

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      absence_justifications: {
        Row: {
          created_at: string
          ends_on: string
          file_id: string | null
          id: string
          organization_id: string
          reason: string
          records_justified: number | null
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          starts_on: string
          status: string
          student_id: string
          submitted_at: string
          submitted_by: string | null
          submitted_via: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          file_id?: string | null
          id?: string
          organization_id: string
          reason: string
          records_justified?: number | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          starts_on: string
          status?: string
          student_id: string
          submitted_at?: string
          submitted_by?: string | null
          submitted_via?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          file_id?: string | null
          id?: string
          organization_id?: string
          reason?: string
          records_justified?: number | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          starts_on?: string
          status?: string
          student_id?: string
          submitted_at?: string
          submitted_by?: string | null
          submitted_via?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_justifications_organization_id_file_id_fkey"
            columns: ["organization_id", "file_id"]
            isOneToOne: false
            referencedRelation: "file_objects"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "absence_justifications_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "absence_justifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_justifications_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      academic_periods: {
        Row: {
          academic_year_id: string
          created_at: string
          ends_on: string
          id: string
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          name: string
          organization_id: string
          sequence: number
          starts_on: string
          type: Database["public"]["Enums"]["period_type"]
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          ends_on: string
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          name: string
          organization_id: string
          sequence?: number
          starts_on: string
          type?: Database["public"]["Enums"]["period_type"]
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          ends_on?: string
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          name?: string
          organization_id?: string
          sequence?: number
          starts_on?: string
          type?: Database["public"]["Enums"]["period_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_periods_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_periods_organization_id_academic_year_id_fkey"
            columns: ["organization_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      academic_years: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          is_current: boolean
          name: string
          organization_id: string
          starts_on: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          is_current?: boolean
          name: string
          organization_id: string
          starts_on: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          is_current?: boolean
          name?: string
          organization_id?: string
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      announcements: {
        Row: {
          audience: Json
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string
          expires_at: string | null
          id: string
          is_pinned: boolean
          organization_id: string
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience?: Json
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_pinned?: boolean
          organization_id: string
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Json
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_pinned?: boolean
          organization_id?: string
          published_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      assessments: {
        Row: {
          academic_period_id: string
          assessed_on: string
          class_id: string
          class_subject_id: string
          coefficient: number
          column_key: string | null
          created_at: string
          created_by: string | null
          description: string | null
          grades_status: string
          grades_validated_at: string | null
          grades_validated_by: string | null
          id: string
          is_published: boolean
          kind: string
          max_score: number
          organization_id: string
          published_at: string | null
          subject_id: string
          title: string
          updated_at: string
        }
        Insert: {
          academic_period_id: string
          assessed_on?: string
          class_id?: string
          class_subject_id: string
          coefficient?: number
          column_key?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          grades_status?: string
          grades_validated_at?: string | null
          grades_validated_by?: string | null
          id?: string
          is_published?: boolean
          kind?: string
          max_score?: number
          organization_id: string
          published_at?: string | null
          subject_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          academic_period_id?: string
          assessed_on?: string
          class_id?: string
          class_subject_id?: string
          coefficient?: number
          column_key?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          grades_status?: string
          grades_validated_at?: string | null
          grades_validated_by?: string | null
          id?: string
          is_published?: boolean
          kind?: string
          max_score?: number
          organization_id?: string
          published_at?: string | null
          subject_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_grades_validated_by_fkey"
            columns: ["grades_validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_organization_id_academic_period_id_fkey"
            columns: ["organization_id", "academic_period_id"]
            isOneToOne: false
            referencedRelation: "academic_periods"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "assessments_organization_id_class_id_fkey"
            columns: ["organization_id", "class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "assessments_organization_id_class_subject_id_fkey"
            columns: ["organization_id", "class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "assessments_organization_id_subject_id_fkey"
            columns: ["organization_id", "subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      attendance_records: {
        Row: {
          arrived_at: string | null
          comment: string | null
          created_at: string
          id: string
          is_justified: boolean
          justification: string | null
          justified_at: string | null
          justified_by: string | null
          minutes_late: number | null
          organization_id: string
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          arrived_at?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          is_justified?: boolean
          justification?: string | null
          justified_at?: string | null
          justified_by?: string | null
          minutes_late?: number | null
          organization_id: string
          session_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          arrived_at?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          is_justified?: boolean
          justification?: string | null
          justified_at?: string | null
          justified_by?: string | null
          minutes_late?: number | null
          organization_id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_justified_by_fkey"
            columns: ["justified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_organization_id_session_id_fkey"
            columns: ["organization_id", "session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "attendance_records_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      attendance_sessions: {
        Row: {
          class_id: string
          class_subject_id: string | null
          created_at: string
          ends_at: string
          id: string
          notes: string | null
          organization_id: string
          session_date: string
          starts_at: string
          status: string
          taken_by: string | null
          timetable_slot_id: string | null
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          class_id: string
          class_subject_id?: string | null
          created_at?: string
          ends_at: string
          id?: string
          notes?: string | null
          organization_id: string
          session_date?: string
          starts_at: string
          status?: string
          taken_by?: string | null
          timetable_slot_id?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          class_id?: string
          class_subject_id?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          session_date?: string
          starts_at?: string
          status?: string
          taken_by?: string | null
          timetable_slot_id?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_organization_id_class_id_fkey"
            columns: ["organization_id", "class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "attendance_sessions_organization_id_class_subject_id_fkey"
            columns: ["organization_id", "class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "attendance_sessions_organization_id_timetable_slot_id_fkey"
            columns: ["organization_id", "timetable_slot_id"]
            isOneToOne: false
            referencedRelation: "timetable_slots"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "attendance_sessions_taken_by_fkey"
            columns: ["taken_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_role: string | null
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: number
          metadata: Json
          organization_id: string | null
          result: string
          summary: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          metadata?: Json
          organization_id?: string | null
          result?: string
          summary?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          metadata?: Json
          organization_id?: string | null
          result?: string
          summary?: string | null
        }
        Relationships: [
          
        ]
      }
      badge_scans: {
        Row: {
          badge_id: string | null
          device: string | null
          id: string
          kind: string | null
          lesson_unlock_id: string | null
          message: string
          organization_id: string
          reason: string
          result: string
          scanned_at: string
          scanned_by: string | null
          staff_id: string | null
        }
        Insert: {
          badge_id?: string | null
          device?: string | null
          id?: string
          kind?: string | null
          lesson_unlock_id?: string | null
          message: string
          organization_id: string
          reason: string
          result: string
          scanned_at?: string
          scanned_by?: string | null
          staff_id?: string | null
        }
        Update: {
          badge_id?: string | null
          device?: string | null
          id?: string
          kind?: string | null
          lesson_unlock_id?: string | null
          message?: string
          organization_id?: string
          reason?: string
          result?: string
          scanned_at?: string
          scanned_by?: string | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "badge_scans_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "staff_badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "badge_scans_lesson_unlock_id_fkey"
            columns: ["lesson_unlock_id"]
            isOneToOne: false
            referencedRelation: "lesson_unlocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "badge_scans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "badge_scans_scanned_by_fkey"
            columns: ["scanned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "badge_scans_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          }
        ]
      }
      class_subjects: {
        Row: {
          class_id: string
          coefficient: number
          created_at: string
          id: string
          organization_id: string
          sort_order: number
          subject_id: string
          teacher_id: string | null
          updated_at: string
          weekly_hours: number | null
        }
        Insert: {
          class_id: string
          coefficient?: number
          created_at?: string
          id?: string
          organization_id: string
          sort_order?: number
          subject_id: string
          teacher_id?: string | null
          updated_at?: string
          weekly_hours?: number | null
        }
        Update: {
          class_id?: string
          coefficient?: number
          created_at?: string
          id?: string
          organization_id?: string
          sort_order?: number
          subject_id?: string
          teacher_id?: string | null
          updated_at?: string
          weekly_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "class_subjects_organization_id_class_id_fkey"
            columns: ["organization_id", "class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "class_subjects_organization_id_subject_id_fkey"
            columns: ["organization_id", "subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "class_subjects_organization_id_teacher_id_fkey"
            columns: ["organization_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      classes: {
        Row: {
          academic_year_id: string
          archived_at: string | null
          capacity: number | null
          code: string | null
          created_at: string
          ends_on: string | null
          head_teacher_id: string | null
          id: string
          kind: string
          level_id: string | null
          name: string
          organization_id: string
          program_id: string | null
          room_id: string | null
          search_text: string | null
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          archived_at?: string | null
          capacity?: number | null
          code?: string | null
          created_at?: string
          ends_on?: string | null
          head_teacher_id?: string | null
          id?: string
          kind?: string
          level_id?: string | null
          name: string
          organization_id: string
          program_id?: string | null
          room_id?: string | null
          search_text?: never
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          archived_at?: string | null
          capacity?: number | null
          code?: string | null
          created_at?: string
          ends_on?: string | null
          head_teacher_id?: string | null
          id?: string
          kind?: string
          level_id?: string | null
          name?: string
          organization_id?: string
          program_id?: string | null
          room_id?: string | null
          search_text?: never
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_organization_id_academic_year_id_fkey"
            columns: ["organization_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "classes_organization_id_head_teacher_id_fkey"
            columns: ["organization_id", "head_teacher_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "classes_organization_id_level_id_fkey"
            columns: ["organization_id", "level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "classes_organization_id_program_id_fkey"
            columns: ["organization_id", "program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "classes_organization_id_room_id_fkey"
            columns: ["organization_id", "room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      conduct_records: {
        Row: {
          created_at: string
          description: string | null
          id: string
          kind: string
          occurred_on: string
          organization_id: string
          recorded_by: string | null
          student_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          occurred_on?: string
          organization_id: string
          recorded_by?: string | null
          student_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          occurred_on?: string
          organization_id?: string
          recorded_by?: string | null
          student_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "conduct_records_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "conduct_records_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      document_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          kind: string
          layout: Json
          name: string
          organization_id: string
          orientation: string
          page_size: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          kind: string
          layout?: Json
          name: string
          organization_id: string
          orientation?: string
          page_size?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          kind?: string
          layout?: Json
          name?: string
          organization_id?: string
          orientation?: string
          page_size?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      enrollments: {
        Row: {
          academic_year_id: string
          class_id: string | null
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          form_data: Json
          form_definition_id: string | null
          id: string
          level_id: string | null
          notes: string | null
          organization_id: string
          program_id: string | null
          reference: string
          search_text: string | null
          status: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          submitted_at: string | null
          type: Database["public"]["Enums"]["enrollment_type"]
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          form_data?: Json
          form_definition_id?: string | null
          id?: string
          level_id?: string | null
          notes?: string | null
          organization_id: string
          program_id?: string | null
          reference?: string
          search_text?: never
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          submitted_at?: string | null
          type?: Database["public"]["Enums"]["enrollment_type"]
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          form_data?: Json
          form_definition_id?: string | null
          id?: string
          level_id?: string | null
          notes?: string | null
          organization_id?: string
          program_id?: string | null
          reference?: string
          search_text?: never
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id?: string
          submitted_at?: string | null
          type?: Database["public"]["Enums"]["enrollment_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_organization_id_academic_year_id_fkey"
            columns: ["organization_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "enrollments_organization_id_class_id_fkey"
            columns: ["organization_id", "class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "enrollments_organization_id_form_definition_id_fkey"
            columns: ["organization_id", "form_definition_id"]
            isOneToOne: false
            referencedRelation: "form_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "enrollments_organization_id_level_id_fkey"
            columns: ["organization_id", "level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "enrollments_organization_id_program_id_fkey"
            columns: ["organization_id", "program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "enrollments_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      expenses: {
        Row: {
          amount: number
          archived_at: string | null
          archived_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          category_id: string
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          number: string
          organization_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          receipt_file_id: string | null
          reference: string | null
          search_text: string | null
          spent_on: string
          status: string
          supplier: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          archived_at?: string | null
          archived_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          category_id: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          number?: string
          organization_id: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_file_id?: string | null
          reference?: string | null
          search_text?: never
          spent_on?: string
          status?: string
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          archived_at?: string | null
          archived_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          category_id?: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          number?: string
          organization_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_file_id?: string | null
          reference?: string | null
          search_text?: never
          spent_on?: string
          status?: string
          supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_organization_id_category_id_fkey"
            columns: ["organization_id", "category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expenses_organization_id_receipt_file_id_fkey"
            columns: ["organization_id", "receipt_file_id"]
            isOneToOne: false
            referencedRelation: "file_objects"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      fee_rates: {
        Row: {
          academic_year_id: string
          amount: number
          class_id: string | null
          created_at: string
          fee_type_id: string
          id: string
          installment_plan: Json
          is_mandatory: boolean
          level_id: string | null
          notes: string | null
          organization_id: string
          program_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          amount: number
          class_id?: string | null
          created_at?: string
          fee_type_id: string
          id?: string
          installment_plan?: Json
          is_mandatory?: boolean
          level_id?: string | null
          notes?: string | null
          organization_id: string
          program_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          amount?: number
          class_id?: string | null
          created_at?: string
          fee_type_id?: string
          id?: string
          installment_plan?: Json
          is_mandatory?: boolean
          level_id?: string | null
          notes?: string | null
          organization_id?: string
          program_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_rates_organization_id_academic_year_id_fkey"
            columns: ["organization_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "fee_rates_organization_id_class_id_fkey"
            columns: ["organization_id", "class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "fee_rates_organization_id_fee_type_id_fkey"
            columns: ["organization_id", "fee_type_id"]
            isOneToOne: false
            referencedRelation: "fee_types"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "fee_rates_organization_id_level_id_fkey"
            columns: ["organization_id", "level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "fee_rates_organization_id_program_id_fkey"
            columns: ["organization_id", "program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      fee_types: {
        Row: {
          category: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      file_objects: {
        Row: {
          bucket: string
          category: string | null
          content: string | null
          created_at: string
          file_name: string
          id: string
          mime_type: string
          organization_id: string
          owner_id: string | null
          owner_type: string
          path: string
          sha256: string | null
          size_bytes: number
          uploaded_by: string | null
        }
        Insert: {
          bucket: string
          category?: string | null
          content?: string | null
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          organization_id: string
          owner_id?: string | null
          owner_type: string
          path: string
          sha256?: string | null
          size_bytes: number
          uploaded_by?: string | null
        }
        Update: {
          bucket?: string
          category?: string | null
          content?: string | null
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          organization_id?: string
          owner_id?: string | null
          owner_type?: string
          path?: string
          sha256?: string | null
          size_bytes?: number
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_objects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_objects_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      form_definitions: {
        Row: {
          created_at: string
          description: string | null
          fields: Json
          id: string
          is_active: boolean
          kind: string
          name: string
          organization_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          fields?: Json
          id?: string
          is_active?: boolean
          kind: string
          name: string
          organization_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          fields?: Json
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          organization_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      grades: {
        Row: {
          assessment_id: string
          comment: string | null
          created_at: string
          graded_by: string | null
          id: string
          is_absent: boolean
          is_exempt: boolean
          organization_id: string
          score: number | null
          student_id: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          comment?: string | null
          created_at?: string
          graded_by?: string | null
          id?: string
          is_absent?: boolean
          is_exempt?: boolean
          organization_id: string
          score?: number | null
          student_id: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          comment?: string | null
          created_at?: string
          graded_by?: string | null
          id?: string
          is_absent?: boolean
          is_exempt?: boolean
          organization_id?: string
          score?: number | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_organization_id_assessment_id_fkey"
            columns: ["organization_id", "assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "grades_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      guardians: {
        Row: {
          address: string | null
          archived_at: string | null
          city: string | null
          created_at: string
          created_by: string | null
          email: string | null
          employer: string | null
          first_name: string
          id: string
          last_name: string
          national_id: string | null
          organization_id: string
          phone: string | null
          phone_secondary: string | null
          profession: string | null
          search_text: string | null
          sex: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          employer?: string | null
          first_name: string
          id?: string
          last_name: string
          national_id?: string | null
          organization_id: string
          phone?: string | null
          phone_secondary?: string | null
          profession?: string | null
          search_text?: never
          sex?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          employer?: string | null
          first_name?: string
          id?: string
          last_name?: string
          national_id?: string | null
          organization_id?: string
          phone?: string | null
          phone_secondary?: string | null
          profession?: string | null
          search_text?: never
          sex?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardians_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      installments: {
        Row: {
          amount: number
          created_at: string
          due_on: string
          id: string
          invoice_id: string
          label: string
          organization_id: string
          sequence: number
        }
        Insert: {
          amount: number
          created_at?: string
          due_on: string
          id?: string
          invoice_id: string
          label: string
          organization_id: string
          sequence?: number
        }
        Update: {
          amount?: number
          created_at?: string
          due_on?: string
          id?: string
          invoice_id?: string
          label?: string
          organization_id?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "installments_organization_id_invoice_id_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      invoice_lines: {
        Row: {
          amount: number | null
          created_at: string
          description: string
          discount_amount: number
          discount_reason: string | null
          fee_type_id: string | null
          id: string
          invoice_id: string
          organization_id: string
          quantity: number
          sort_order: number
          unit_amount: number
        }
        Insert: {
          amount?: never
          created_at?: string
          description: string
          discount_amount?: number
          discount_reason?: string | null
          fee_type_id?: string | null
          id?: string
          invoice_id: string
          organization_id: string
          quantity?: number
          sort_order?: number
          unit_amount: number
        }
        Update: {
          amount?: never
          created_at?: string
          description?: string
          discount_amount?: number
          discount_reason?: string | null
          fee_type_id?: string | null
          id?: string
          invoice_id?: string
          organization_id?: string
          quantity?: number
          sort_order?: number
          unit_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_organization_id_fee_type_id_fkey"
            columns: ["organization_id", "fee_type_id"]
            isOneToOne: false
            referencedRelation: "fee_types"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "invoice_lines_organization_id_invoice_id_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      invoice_reminders: {
        Row: {
          amount_due: number
          balance: number
          due_on: string | null
          id: string
          invoice_id: string
          kind: string
          organization_id: string
          recipients: number
          sent_at: string
          sent_by: string | null
          student_id: string
        }
        Insert: {
          amount_due?: number
          balance?: number
          due_on?: string | null
          id?: string
          invoice_id: string
          kind: string
          organization_id: string
          recipients?: number
          sent_at?: string
          sent_by?: string | null
          student_id: string
        }
        Update: {
          amount_due?: number
          balance?: number
          due_on?: string | null
          id?: string
          invoice_id?: string
          kind?: string
          organization_id?: string
          recipients?: number
          sent_at?: string
          sent_by?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminders_organization_id_invoice_id_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "invoice_reminders_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "invoice_reminders_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      invoices: {
        Row: {
          academic_year_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount_total: number
          due_on: string | null
          enrollment_id: string | null
          id: string
          issued_on: string
          notes: string | null
          number: string
          organization_id: string
          search_text: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          student_id: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          due_on?: string | null
          enrollment_id?: string | null
          id?: string
          issued_on?: string
          notes?: string | null
          number?: string
          organization_id: string
          search_text?: never
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          due_on?: string | null
          enrollment_id?: string | null
          id?: string
          issued_on?: string
          notes?: string | null
          number?: string
          organization_id?: string
          search_text?: never
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_academic_year_id_fkey"
            columns: ["organization_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "invoices_organization_id_enrollment_id_fkey"
            columns: ["organization_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "invoices_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      issued_documents: {
        Row: {
          content_hash: string | null
          data: Json
          expires_at: string | null
          file_path: string | null
          holder_display: string | null
          id: string
          issued_at: string
          issued_by: string | null
          kind: string
          number: string
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          search_text: string | null
          status: string
          student_id: string | null
          subject_id: string | null
          subject_type: string | null
          template_id: string | null
          title: string
          verification_code: string
        }
        Insert: {
          content_hash?: string | null
          data?: Json
          expires_at?: string | null
          file_path?: string | null
          holder_display?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          kind: string
          number?: string
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          search_text?: never
          status?: string
          student_id?: string | null
          subject_id?: string | null
          subject_type?: string | null
          template_id?: string | null
          title: string
          verification_code?: string
        }
        Update: {
          content_hash?: string | null
          data?: Json
          expires_at?: string | null
          file_path?: string | null
          holder_display?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          kind?: string
          number?: string
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          search_text?: never
          status?: string
          student_id?: string | null
          subject_id?: string | null
          subject_type?: string | null
          template_id?: string | null
          title?: string
          verification_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "issued_documents_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_documents_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "issued_documents_organization_id_template_id_fkey"
            columns: ["organization_id", "template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "issued_documents_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      lesson_unlocks: {
        Row: {
          class_id: string
          class_subject_id: string | null
          ends_at: string
          id: string
          lesson_date: string
          method: string
          organization_id: string
          reason: string | null
          starts_at: string
          teacher_id: string
          timetable_slot_id: string
          unlocked_at: string
          unlocked_by: string | null
        }
        Insert: {
          class_id: string
          class_subject_id?: string | null
          ends_at: string
          id?: string
          lesson_date: string
          method?: string
          organization_id: string
          reason?: string | null
          starts_at: string
          teacher_id: string
          timetable_slot_id: string
          unlocked_at?: string
          unlocked_by?: string | null
        }
        Update: {
          class_id?: string
          class_subject_id?: string | null
          ends_at?: string
          id?: string
          lesson_date?: string
          method?: string
          organization_id?: string
          reason?: string | null
          starts_at?: string
          teacher_id?: string
          timetable_slot_id?: string
          unlocked_at?: string
          unlocked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_unlocks_organization_id_class_id_fkey"
            columns: ["organization_id", "class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lesson_unlocks_organization_id_class_subject_id_fkey"
            columns: ["organization_id", "class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lesson_unlocks_organization_id_teacher_id_fkey"
            columns: ["organization_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lesson_unlocks_organization_id_timetable_slot_id_fkey"
            columns: ["organization_id", "timetable_slot_id"]
            isOneToOne: false
            referencedRelation: "timetable_slots"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lesson_unlocks_unlocked_by_fkey"
            columns: ["unlocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      levels: {
        Row: {
          created_at: string
          cycle: string | null
          id: string
          name: string
          organization_id: string
          sequence: number
          short_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cycle?: string | null
          id?: string
          name: string
          organization_id: string
          sequence?: number
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cycle?: string | null
          id?: string
          name?: string
          organization_id?: string
          sequence?: number
          short_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "levels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      membership_roles: {
        Row: {
          created_at: string
          membership_id: string
          organization_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          membership_id: string
          organization_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          membership_id?: string
          organization_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_roles_organization_id_membership_id_fkey"
            columns: ["organization_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "membership_roles_organization_id_role_id_fkey"
            columns: ["organization_id", "role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string | null
          organization_id: string
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      message_threads: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_message_at: string
          organization_id: string
          subject: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string
          organization_id: string
          subject: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string
          organization_id?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          organization_id: string
          sender_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          organization_id: string
          sender_id?: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          organization_id?: string
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_organization_id_thread_id_fkey"
            columns: ["organization_id", "thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      notification_deliveries: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          destination: string | null
          id: string
          last_error: string | null
          notification_id: string
          organization_id: string
          provider_reference: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          destination?: string | null
          id?: string
          last_error?: string | null
          notification_id: string
          organization_id: string
          provider_reference?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          destination?: string | null
          id?: string
          last_error?: string | null
          notification_id?: string
          organization_id?: string
          provider_reference?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      notification_preferences: {
        Row: {
          channels: string[]
          notification_type: string
          organization_id: string
          user_id: string
        }
        Insert: {
          channels?: string[]
          notification_type: string
          organization_id: string
          user_id: string
        }
        Update: {
          channels?: string[]
          notification_type?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          link: string | null
          organization_id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          link?: string | null
          organization_id: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          link?: string | null
          organization_id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      organization_branding: {
        Row: {
          footer_text: string | null
          header_text: string | null
          logo_path: string | null
          organization_id: string
          primary_color: string
          secondary_color: string
          signatory_name: string | null
          signatory_title: string | null
          signature_path: string | null
          stamp_path: string | null
          updated_at: string
        }
        Insert: {
          footer_text?: string | null
          header_text?: string | null
          logo_path?: string | null
          organization_id: string
          primary_color?: string
          secondary_color?: string
          signatory_name?: string | null
          signatory_title?: string | null
          signature_path?: string | null
          stamp_path?: string | null
          updated_at?: string
        }
        Update: {
          footer_text?: string | null
          header_text?: string | null
          logo_path?: string | null
          organization_id?: string
          primary_color?: string
          secondary_color?: string
          signatory_name?: string | null
          signatory_title?: string | null
          signature_path?: string | null
          stamp_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_branding_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      organization_counters: {
        Row: {
          last_value: number
          organization_id: string
          period: string
          scope: string
        }
        Insert: {
          last_value?: number
          organization_id: string
          period?: string
          scope: string
        }
        Update: {
          last_value?: number
          organization_id?: string
          period?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      organizations: {
        Row: {
          address: string | null
          city: string | null
          code: string
          country: string
          created_at: string
          currency: string
          email: string | null
          id: string
          is_demo: boolean
          locale: string
          name: string
          parent_id: string | null
          phone: string | null
          settings: Json
          short_name: string | null
          slug: string
          status: Database["public"]["Enums"]["organization_status"]
          timezone: string
          type: Database["public"]["Enums"]["organization_type"]
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          country?: string
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          is_demo?: boolean
          locale?: string
          name: string
          parent_id?: string | null
          phone?: string | null
          settings?: Json
          short_name?: string | null
          slug: string
          status?: Database["public"]["Enums"]["organization_status"]
          timezone?: string
          type: Database["public"]["Enums"]["organization_type"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          country?: string
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          is_demo?: boolean
          locale?: string
          name?: string
          parent_id?: string | null
          phone?: string | null
          settings?: Json
          short_name?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["organization_status"]
          timezone?: string
          type?: Database["public"]["Enums"]["organization_type"]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      payments: {
        Row: {
          amount: number
          balance_after: number | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          created_at: string
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          number: string
          organization_id: string
          paid_at: string
          payer_name: string | null
          received_by: string | null
          received_by_name: string | null
          reference: string | null
          search_text: string | null
          status: Database["public"]["Enums"]["payment_status"]
          student_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          id?: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          number?: string
          organization_id: string
          paid_at?: string
          payer_name?: string | null
          received_by?: string | null
          received_by_name?: string | null
          reference?: string | null
          search_text?: never
          status?: Database["public"]["Enums"]["payment_status"]
          student_id?: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          number?: string
          organization_id?: string
          paid_at?: string
          payer_name?: string | null
          received_by?: string | null
          received_by_name?: string | null
          reference?: string | null
          search_text?: never
          status?: Database["public"]["Enums"]["payment_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_invoice_id_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "payments_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      permissions: {
        Row: {
          code: string
          label: string
          module: string
          sort_order: number
        }
        Insert: {
          code: string
          label: string
          module: string
          sort_order?: number
        }
        Update: {
          code?: string
          label?: string
          module?: string
          sort_order?: number
        }
        Relationships: [
          
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      portal_access_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          expires_on: string | null
          mode: string
          organization_id: string
          reason: string
          student_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_on?: string | null
          mode: string
          organization_id: string
          reason: string
          student_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_on?: string | null
          mode?: string
          organization_id?: string
          reason?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_access_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_access_overrides_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          is_active: boolean
          last_name: string | null
          last_organization_id: string | null
          last_seen_at: string | null
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id: string
          is_active?: boolean
          last_name?: string | null
          last_organization_id?: string | null
          last_seen_at?: string | null
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          last_organization_id?: string | null
          last_seen_at?: string | null
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_last_organization_id_fkey"
            columns: ["last_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      programs: {
        Row: {
          code: string
          created_at: string
          description: string | null
          duration_hours: number | null
          id: string
          is_active: boolean
          kind: string
          name: string
          organization_id: string
          search_text: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          duration_hours?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          organization_id: string
          search_text?: never
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          duration_hours?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          organization_id?: string
          search_text?: never
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      report_card_settings: {
        Row: {
          config: Json
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_card_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_card_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      report_cards: {
        Row: {
          academic_period_id: string
          appreciation: string | null
          average: number | null
          class_id: string
          class_size: number | null
          created_at: string
          data: Json
          decision: string | null
          head_teacher_comment: string | null
          id: string
          issued_document_id: string | null
          organization_id: string
          published_at: string | null
          published_by: string | null
          rank: number | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_period_id: string
          appreciation?: string | null
          average?: number | null
          class_id: string
          class_size?: number | null
          created_at?: string
          data?: Json
          decision?: string | null
          head_teacher_comment?: string | null
          id?: string
          issued_document_id?: string | null
          organization_id: string
          published_at?: string | null
          published_by?: string | null
          rank?: number | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_period_id?: string
          appreciation?: string | null
          average?: number | null
          class_id?: string
          class_size?: number | null
          created_at?: string
          data?: Json
          decision?: string | null
          head_teacher_comment?: string | null
          id?: string
          issued_document_id?: string | null
          organization_id?: string
          published_at?: string | null
          published_by?: string | null
          rank?: number | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_organization_id_academic_period_id_fkey"
            columns: ["organization_id", "academic_period_id"]
            isOneToOne: false
            referencedRelation: "academic_periods"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "report_cards_organization_id_class_id_fkey"
            columns: ["organization_id", "class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "report_cards_organization_id_issued_document_id_fkey"
            columns: ["organization_id", "issued_document_id"]
            isOneToOne: false
            referencedRelation: "issued_documents"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "report_cards_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "report_cards_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      role_permissions: {
        Row: {
          permission_code: string
          role_id: string
        }
        Insert: {
          permission_code: string
          role_id: string
        }
        Update: {
          permission_code?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          }
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          key: string
          name: string
          organization_id: string | null
          persona: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          name: string
          organization_id?: string | null
          persona?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          organization_id?: string | null
          persona?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      rooms: {
        Row: {
          building: string | null
          capacity: number | null
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          building?: string | null
          capacity?: number | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          building?: string | null
          capacity?: number | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      staff_attendance: {
        Row: {
          arrived_at: string
          created_at: string
          departed_at: string | null
          expected_start: string | null
          id: string
          minutes_late: number
          organization_id: string
          staff_id: string
          updated_at: string
          work_date: string
        }
        Insert: {
          arrived_at: string
          created_at?: string
          departed_at?: string | null
          expected_start?: string | null
          id?: string
          minutes_late?: number
          organization_id: string
          staff_id: string
          updated_at?: string
          work_date: string
        }
        Update: {
          arrived_at?: string
          created_at?: string
          departed_at?: string | null
          expected_start?: string | null
          id?: string
          minutes_late?: number
          organization_id?: string
          staff_id?: string
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_attendance_organization_id_staff_id_fkey"
            columns: ["organization_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      staff_badges: {
        Row: {
          academic_year_id: string | null
          id: string
          issued_at: string
          issued_by: string | null
          last_printed_at: string | null
          number: string
          organization_id: string
          printed_count: number
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          staff_id: string
          status: string
          token: string
        }
        Insert: {
          academic_year_id?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          last_printed_at?: string | null
          number?: string
          organization_id: string
          printed_count?: number
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          staff_id: string
          status?: string
          token?: string
        }
        Update: {
          academic_year_id?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          last_printed_at?: string | null
          number?: string
          organization_id?: string
          printed_count?: number
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          staff_id?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_badges_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_badges_organization_id_academic_year_id_fkey"
            columns: ["organization_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "staff_badges_organization_id_staff_id_fkey"
            columns: ["organization_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "staff_badges_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      staff_members: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          email: string | null
          employee_number: string | null
          first_name: string
          hired_on: string | null
          id: string
          is_teacher: boolean
          job_title: string | null
          last_name: string
          organization_id: string
          phone: string | null
          photo_path: string | null
          search_text: string | null
          sex: string | null
          specialties: string[]
          status: string
          status_changed_at: string | null
          status_reason: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          employee_number?: string | null
          first_name: string
          hired_on?: string | null
          id?: string
          is_teacher?: boolean
          job_title?: string | null
          last_name: string
          organization_id: string
          phone?: string | null
          photo_path?: string | null
          search_text?: never
          sex?: string | null
          specialties?: string[]
          status?: string
          status_changed_at?: string | null
          status_reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          employee_number?: string | null
          first_name?: string
          hired_on?: string | null
          id?: string
          is_teacher?: boolean
          job_title?: string | null
          last_name?: string
          organization_id?: string
          phone?: string | null
          photo_path?: string | null
          search_text?: never
          sex?: string | null
          specialties?: string[]
          status?: string
          status_changed_at?: string | null
          status_reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      student_guardians: {
        Row: {
          created_at: string
          guardian_id: string
          id: string
          is_emergency_contact: boolean
          is_financial_responsible: boolean
          is_primary: boolean
          organization_id: string
          portal_access: boolean
          relationship: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          guardian_id: string
          id?: string
          is_emergency_contact?: boolean
          is_financial_responsible?: boolean
          is_primary?: boolean
          organization_id: string
          portal_access?: boolean
          relationship?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          guardian_id?: string
          id?: string
          is_emergency_contact?: boolean
          is_financial_responsible?: boolean
          is_primary?: boolean
          organization_id?: string
          portal_access?: boolean
          relationship?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_organization_id_guardian_id_fkey"
            columns: ["organization_id", "guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "student_guardians_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      student_medical_records: {
        Row: {
          allergies: string | null
          blood_group: string | null
          conditions: string | null
          doctor_name: string | null
          doctor_phone: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          medications: string | null
          notes: string | null
          organization_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          blood_group?: string | null
          conditions?: string | null
          doctor_name?: string | null
          doctor_phone?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          medications?: string | null
          notes?: string | null
          organization_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          blood_group?: string | null
          conditions?: string | null
          doctor_name?: string | null
          doctor_phone?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          medications?: string | null
          notes?: string | null
          organization_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_medical_records_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      student_previous_schools: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          from_year: number | null
          id: string
          last_level: string | null
          notes: string | null
          organization_id: string
          school_name: string
          student_id: string
          to_year: number | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          from_year?: number | null
          id?: string
          last_level?: string | null
          notes?: string | null
          organization_id: string
          school_name: string
          student_id: string
          to_year?: number | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          from_year?: number | null
          id?: string
          last_level?: string | null
          notes?: string | null
          organization_id?: string
          school_name?: string
          student_id?: string
          to_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "student_previous_schools_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      students: {
        Row: {
          address: string | null
          archived_at: string | null
          archived_by: string | null
          birth_date: string | null
          birth_place: string | null
          city: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json
          email: string | null
          first_name: string
          id: string
          last_name: string
          matricule: string
          national_id: string | null
          nationality: string | null
          notes: string | null
          organization_id: string
          other_names: string | null
          phone: string | null
          photo_path: string | null
          search_text: string | null
          sex: string | null
          status: string
          status_changed_at: string | null
          status_reason: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          birth_date?: string | null
          birth_place?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          matricule?: string
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          organization_id: string
          other_names?: string | null
          phone?: string | null
          photo_path?: string | null
          search_text?: never
          sex?: string | null
          status?: string
          status_changed_at?: string | null
          status_reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          birth_date?: string | null
          birth_place?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          matricule?: string
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          organization_id?: string
          other_names?: string | null
          phone?: string | null
          photo_path?: string | null
          search_text?: never
          sex?: string | null
          status?: string
          status_changed_at?: string | null
          status_reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      subjects: {
        Row: {
          code: string
          color: string | null
          created_at: string
          credits: number | null
          id: string
          is_active: boolean
          kind: string
          name: string
          organization_id: string
          program_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          credits?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          organization_id: string
          program_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          credits?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          organization_id?: string
          program_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_organization_id_program_id_fkey"
            columns: ["organization_id", "program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      thread_participants: {
        Row: {
          created_at: string
          last_read_at: string | null
          organization_id: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_read_at?: string | null
          organization_id: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_read_at?: string | null
          organization_id?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_participants_organization_id_thread_id_fkey"
            columns: ["organization_id", "thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "thread_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      timetable_slots: {
        Row: {
          academic_year_id: string
          class_id: string
          class_subject_id: string | null
          created_at: string
          ends_at: string
          id: string
          label: string | null
          organization_id: string
          room_id: string | null
          starts_at: string
          teacher_id: string | null
          updated_at: string
          weekday: number
        }
        Insert: {
          academic_year_id: string
          class_id: string
          class_subject_id?: string | null
          created_at?: string
          ends_at: string
          id?: string
          label?: string | null
          organization_id: string
          room_id?: string | null
          starts_at: string
          teacher_id?: string | null
          updated_at?: string
          weekday: number
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          class_subject_id?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          label?: string | null
          organization_id?: string
          room_id?: string | null
          starts_at?: string
          teacher_id?: string | null
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_organization_id_academic_year_id_fkey"
            columns: ["organization_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "timetable_slots_organization_id_class_id_fkey"
            columns: ["organization_id", "class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "timetable_slots_organization_id_class_subject_id_fkey"
            columns: ["organization_id", "class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "timetable_slots_organization_id_room_id_fkey"
            columns: ["organization_id", "room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "timetable_slots_organization_id_teacher_id_fkey"
            columns: ["organization_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
    }
    Views: {
      invoice_balances: {
        Row: {
          academic_year_id: string | null
          balance: number | null
          currency: string | null
          due_on: string | null
          invoice_id: string | null
          is_overdue: boolean | null
          issued_on: string | null
          next_due_on: string | null
          number: string | null
          organization_id: string | null
          paid: number | null
          payment_status: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          student_id: string | null
          total: number | null
        }
        Relationships: []
      }
      student_balances: {
        Row: {
          academic_year_id: string | null
          balance: number | null
          has_overdue: boolean | null
          organization_id: string | null
          student_id: string | null
          total_invoiced: number | null
          total_paid: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_student_guardian: {
        Args: {
          p_student_id: string
          p_guardian: Json
        }
        Returns: string
      }
      change_student_status: {
        Args: {
          p_student_id: string
          p_status: string
          p_reason: string
        }
        Returns: undefined
      }
      compute_report_cards: {
        Args: {
          p_class_id: string
          p_period_id: string
        }
        Returns: number
      }
      create_enrollment_application: {
        Args: {
          p_organization_id: string
          p_payload: Json
        }
        Returns: string
      }
      create_organization: {
        Args: {
          p_name: string
          p_code: string
          p_slug: string
          p_type: Database["public"]["Enums"]["organization_type"]
          p_city?: string
          p_country?: string
          p_currency?: string
          p_timezone?: string
        }
        Returns: string
      }
      create_student_record: {
        Args: {
          p_organization_id: string
          p_payload: Json
        }
        Returns: string
      }
      dashboard_overview: {
        Args: {
          p_organization_id: string
        }
        Returns: Json
      }
      delete_staff_member: {
        Args: {
          p_staff_id: string
          p_confirmation: string
        }
        Returns: undefined
      }
      delete_student: {
        Args: {
          p_student_id: string
          p_confirmation: string
        }
        Returns: undefined
      }
      enrollment_fee_preview: {
        Args: {
          p_enrollment_id: string
        }
        Returns: {
          fee_rate_id: string
          fee_type_id: string
          fee_type_name: string
          category: string
          amount: number
          installment_plan: Json
        }[]
      }
      global_search: {
        Args: {
          p_organization_id: string
          p_query: string
          p_limit?: number
        }
        Returns: {
          entity_type: string
          entity_id: string
          title: string
          subtitle: string
          score: number
        }[]
      }
      grant_portal_access: {
        Args: {
          p_kind: string
          p_record_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      invoice_status_summary: {
        Args: {
          p_organization_id: string
        }
        Returns: {
          payment_status: string
          invoices: number
          balance: number
        }[]
      }
      issue_staff_badge: {
        Args: {
          p_staff_id: string
          p_reason?: string
        }
        Returns: string
      }
      log_event: {
        Args: {
          p_action: string
          p_organization_id?: string
          p_entity_type?: string
          p_entity_id?: string
          p_summary?: string
          p_metadata?: Json
          p_result?: string
        }
        Returns: undefined
      }
      my_lessons: {
        Args: {
          p_from: string
          p_to: string
        }
        Returns: {
          slot_id: string
          lesson_date: string
          starts_at: string
          ends_at: string
          class_id: string
          class_name: string
          class_subject_id: string
          subject_name: string
          room_name: string
          status: string
          unlocked_at: string
          unlock_method: string
          session_id: string
        }[]
      }
      my_permissions: {
        Args: {
          p_org: string
        }
        Returns: string[]
      }
      portal_status: {
        Args: {
          p_student_id: string
        }
        Returns: Json
      }
      preview_report_cards: {
        Args: {
          p_class_id: string
          p_period_id: string
        }
        Returns: {
          student_id: string
          average: number
          rank: number
          class_size: number
          data: Json
        }[]
      }
      record_attendance: {
        Args: {
          p_class_id: string
          p_session_date: string
          p_starts_at: string
          p_ends_at: string
          p_class_subject_id?: string
          p_records?: Json
        }
        Returns: string
      }
      reopen_attendance_session: {
        Args: {
          p_session_id: string
          p_reason: string
        }
        Returns: undefined
      }
      review_absence_justification: {
        Args: {
          p_id: string
          p_decision: string
          p_comment?: string
        }
        Returns: number
      }
      save_grades: {
        Args: {
          p_assessment_id: string
          p_grades: Json
        }
        Returns: number
      }
      scan_staff_badge: {
        Args: {
          p_organization_id: string
          p_code: string
          p_device?: string
        }
        Returns: Json
      }
      send_invoice_reminder: {
        Args: {
          p_invoice_id: string
        }
        Returns: number
      }
      send_invoice_reminders: {
        Args: {
          p_organization_id: string
        }
        Returns: Json
      }
      set_portal_account_status: {
        Args: {
          p_kind: string
          p_record_id: string
          p_active: boolean
        }
        Returns: undefined
      }
      submit_absence_justification: {
        Args: {
          p_student_id: string
          p_starts_on: string
          p_ends_on: string
          p_reason: string
          p_file_id?: string
          p_justification_id?: string
        }
        Returns: string
      }
      take_lesson_attendance: {
        Args: {
          p_slot_id: string
          p_date: string
          p_records?: Json
          p_validate?: boolean
        }
        Returns: string
      }
      unlock_lesson_manually: {
        Args: {
          p_slot_id: string
          p_date: string
          p_reason: string
        }
        Returns: string
      }
      validate_attendance_session: {
        Args: {
          p_session_id: string
        }
        Returns: undefined
      }
      validate_enrollment: {
        Args: {
          p_enrollment_id: string
          p_generate_invoice?: boolean
        }
        Returns: Json
      }
      verify_document: {
        Args: {
          p_code: string
        }
        Returns: {
          status: string
          kind: string
          title: string
          number: string
          issued_at: string
          expires_at: string
          holder: string
          organization_name: string
          organization_city: string
        }[]
      }
    }
    Enums: {
      attendance_status: "present" | "absent" | "late" | "excused"
      enrollment_status: "draft" | "pending" | "validated" | "rejected" | "cancelled"
      enrollment_type: "new" | "reenrollment" | "transfer"
      invoice_status: "draft" | "issued" | "cancelled"
      membership_status: "invited" | "active" | "suspended"
      organization_status: "active" | "suspended" | "archived"
      organization_type: "primary_school" | "middle_school" | "high_school" | "school_complex" | "university" | "institute" | "vocational_center" | "technical_center" | "private_school" | "school_group"
      payment_method: "cash" | "mobile_money" | "bank_transfer" | "card" | "cheque" | "other"
      payment_status: "completed" | "cancelled"
      period_type: "trimester" | "semester" | "session" | "custom"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
