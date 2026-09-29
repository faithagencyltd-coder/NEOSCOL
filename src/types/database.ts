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
      academic_cycles: {
        Row: {
          code: string
          created_at: string
          credits_required: number | null
          duration_years: number | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          sequence: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          credits_required?: number | null
          duration_years?: number | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          sequence?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          credits_required?: number | null
          duration_years?: number | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          sequence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_cycles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          registration_ends_on: string | null
          registration_starts_on: string | null
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
          registration_ends_on?: string | null
          registration_starts_on?: string | null
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
          registration_ends_on?: string | null
          registration_starts_on?: string | null
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
      auth_login_attempts: {
        Row: {
          created_at: string
          id: number
          identifier_hash: string
          ip_hash: string | null
          kind: string
        }
        Insert: {
          created_at?: string
          id?: number
          identifier_hash: string
          ip_hash?: string | null
          kind: string
        }
        Update: {
          created_at?: string
          id?: number
          identifier_hash?: string
          ip_hash?: string | null
          kind?: string
        }
        Relationships: [
          
        ]
      }
      badge_dynamic_uses: {
        Row: {
          badge_id: string
          time_window: number
          used_at: string
        }
        Insert: {
          badge_id: string
          time_window: number
          used_at?: string
        }
        Update: {
          badge_id?: string
          time_window?: number
          used_at?: string
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
          student_badge_id: string | null
          student_id: string | null
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
          student_badge_id?: string | null
          student_id?: string | null
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
          student_badge_id?: string | null
          student_id?: string | null
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
          },
          {
            foreignKeyName: "badge_scans_student_badge_id_fkey"
            columns: ["student_badge_id"]
            isOneToOne: false
            referencedRelation: "student_badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "badge_scans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          syllabus: string | null
          track_id: string | null
          tuition_amount: number | null
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
          syllabus?: string | null
          track_id?: string | null
          tuition_amount?: number | null
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
          syllabus?: string | null
          track_id?: string | null
          tuition_amount?: number | null
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
          },
          {
            foreignKeyName: "classes_organization_id_track_id_fkey"
            columns: ["organization_id", "track_id"]
            isOneToOne: false
            referencedRelation: "program_tracks"
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
      course_registrations: {
        Row: {
          academic_period_id: string
          created_at: string
          created_by: string | null
          enrollment_id: string
          id: string
          note: string | null
          organization_id: string
          status: string
          student_id: string
          teaching_unit_id: string
          updated_at: string
        }
        Insert: {
          academic_period_id: string
          created_at?: string
          created_by?: string | null
          enrollment_id: string
          id?: string
          note?: string | null
          organization_id: string
          status?: string
          student_id: string
          teaching_unit_id: string
          updated_at?: string
        }
        Update: {
          academic_period_id?: string
          created_at?: string
          created_by?: string | null
          enrollment_id?: string
          id?: string
          note?: string | null
          organization_id?: string
          status?: string
          student_id?: string
          teaching_unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_registrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_registrations_organization_id_academic_period_id_fkey"
            columns: ["organization_id", "academic_period_id"]
            isOneToOne: false
            referencedRelation: "academic_periods"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "course_registrations_organization_id_enrollment_id_fkey"
            columns: ["organization_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "course_registrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_registrations_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "course_registrations_organization_id_teaching_unit_id_fkey"
            columns: ["organization_id", "teaching_unit_id"]
            isOneToOne: false
            referencedRelation: "teaching_units"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      defenses: {
        Row: {
          created_at: string
          created_by: string | null
          decision: string | null
          document_file_id: string | null
          grade: number | null
          id: string
          jury: Json
          mention: string | null
          minutes: string | null
          organization_id: string
          room_id: string | null
          scheduled_at: string
          status: string
          student_id: string
          thesis_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decision?: string | null
          document_file_id?: string | null
          grade?: number | null
          id?: string
          jury?: Json
          mention?: string | null
          minutes?: string | null
          organization_id: string
          room_id?: string | null
          scheduled_at: string
          status?: string
          student_id: string
          thesis_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decision?: string | null
          document_file_id?: string | null
          grade?: number | null
          id?: string
          jury?: Json
          mention?: string | null
          minutes?: string | null
          organization_id?: string
          room_id?: string | null
          scheduled_at?: string
          status?: string
          student_id?: string
          thesis_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "defenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defenses_document_file_id_fkey"
            columns: ["document_file_id"]
            isOneToOne: false
            referencedRelation: "file_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defenses_organization_id_room_id_fkey"
            columns: ["organization_id", "room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "defenses_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "defenses_organization_id_thesis_id_fkey"
            columns: ["organization_id", "thesis_id"]
            isOneToOne: false
            referencedRelation: "theses"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      deliberation_decisions: {
        Row: {
          absences: number | null
          average: number | null
          comment: string | null
          created_at: string
          credits_earned: number | null
          credits_total: number | null
          decided_at: string | null
          decided_by: string | null
          decision: string | null
          deliberation_id: string
          enrollment_id: string
          id: string
          is_current: boolean
          organization_id: string
          proposed_decision: string | null
          student_id: string
          validate_credits: boolean
          version: number
        }
        Insert: {
          absences?: number | null
          average?: number | null
          comment?: string | null
          created_at?: string
          credits_earned?: number | null
          credits_total?: number | null
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          deliberation_id: string
          enrollment_id: string
          id?: string
          is_current?: boolean
          organization_id: string
          proposed_decision?: string | null
          student_id: string
          validate_credits?: boolean
          version?: number
        }
        Update: {
          absences?: number | null
          average?: number | null
          comment?: string | null
          created_at?: string
          credits_earned?: number | null
          credits_total?: number | null
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          deliberation_id?: string
          enrollment_id?: string
          id?: string
          is_current?: boolean
          organization_id?: string
          proposed_decision?: string | null
          student_id?: string
          validate_credits?: boolean
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "deliberation_decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliberation_decisions_organization_id_deliberation_id_fkey"
            columns: ["organization_id", "deliberation_id"]
            isOneToOne: false
            referencedRelation: "deliberations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "deliberation_decisions_organization_id_enrollment_id_fkey"
            columns: ["organization_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "deliberation_decisions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliberation_decisions_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      deliberations: {
        Row: {
          academic_period_id: string | null
          class_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          held_on: string | null
          id: string
          members: string | null
          notes: string | null
          organization_id: string
          president: string | null
          session: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          academic_period_id?: string | null
          class_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          held_on?: string | null
          id?: string
          members?: string | null
          notes?: string | null
          organization_id: string
          president?: string | null
          session?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          academic_period_id?: string | null
          class_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          held_on?: string | null
          id?: string
          members?: string | null
          notes?: string | null
          organization_id?: string
          president?: string | null
          session?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliberations_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliberations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliberations_organization_id_academic_period_id_fkey"
            columns: ["organization_id", "academic_period_id"]
            isOneToOne: false
            referencedRelation: "academic_periods"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "deliberations_organization_id_class_id_fkey"
            columns: ["organization_id", "class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "deliberations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string
          description: string | null
          faculty_id: string | null
          head_id: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          faculty_id?: string | null
          head_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          faculty_id?: string | null
          head_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_faculty_id_fkey"
            columns: ["organization_id", "faculty_id"]
            isOneToOne: false
            referencedRelation: "faculties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_organization_id_head_id_fkey"
            columns: ["organization_id", "head_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["organization_id", "id"]
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
      email_verification_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          organization_id: string
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_verification_tokens_organization_id_fkey"
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
          group_id: string | null
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
          track_id: string | null
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
          group_id?: string | null
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
          track_id?: string | null
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
          group_id?: string | null
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
          track_id?: string | null
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
            foreignKeyName: "enrollments_organization_id_group_id_fkey"
            columns: ["organization_id", "group_id"]
            isOneToOne: false
            referencedRelation: "training_groups"
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
          },
          {
            foreignKeyName: "enrollments_organization_id_track_id_fkey"
            columns: ["organization_id", "track_id"]
            isOneToOne: false
            referencedRelation: "program_tracks"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      exam_sessions: {
        Row: {
          academic_period_id: string | null
          academic_year_id: string
          created_at: string
          ends_on: string
          id: string
          kind: string
          name: string
          organization_id: string
          starts_on: string
          status: string
          updated_at: string
        }
        Insert: {
          academic_period_id?: string | null
          academic_year_id: string
          created_at?: string
          ends_on: string
          id?: string
          kind?: string
          name: string
          organization_id: string
          starts_on: string
          status?: string
          updated_at?: string
        }
        Update: {
          academic_period_id?: string | null
          academic_year_id?: string
          created_at?: string
          ends_on?: string
          id?: string
          kind?: string
          name?: string
          organization_id?: string
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_sessions_organization_id_academic_period_id_fkey"
            columns: ["organization_id", "academic_period_id"]
            isOneToOne: false
            referencedRelation: "academic_periods"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "exam_sessions_organization_id_academic_year_id_fkey"
            columns: ["organization_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "exam_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
      faculties: {
        Row: {
          code: string
          created_at: string
          dean_id: string | null
          description: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          dean_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          dean_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faculties_organization_id_dean_id_fkey"
            columns: ["organization_id", "dean_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "faculties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
          custom_fields: Json
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
          custom_fields?: Json
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
          custom_fields?: Json
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
      internships: {
        Row: {
          company_address: string | null
          company_email: string | null
          company_name: string
          company_phone: string | null
          convention_file_id: string | null
          convention_signed: boolean
          created_at: string
          created_by: string | null
          ends_on: string
          enrollment_id: string | null
          evaluated_at: string | null
          evaluation_comment: string | null
          evaluation_score: number | null
          host_kind: string
          id: string
          missions: string | null
          organization_id: string
          report_file_id: string | null
          starts_on: string
          status: string
          student_id: string
          supervisor_name: string | null
          tutor_email: string | null
          tutor_name: string | null
          tutor_phone: string | null
          tutor_title: string | null
          updated_at: string
        }
        Insert: {
          company_address?: string | null
          company_email?: string | null
          company_name: string
          company_phone?: string | null
          convention_file_id?: string | null
          convention_signed?: boolean
          created_at?: string
          created_by?: string | null
          ends_on: string
          enrollment_id?: string | null
          evaluated_at?: string | null
          evaluation_comment?: string | null
          evaluation_score?: number | null
          host_kind?: string
          id?: string
          missions?: string | null
          organization_id: string
          report_file_id?: string | null
          starts_on: string
          status?: string
          student_id: string
          supervisor_name?: string | null
          tutor_email?: string | null
          tutor_name?: string | null
          tutor_phone?: string | null
          tutor_title?: string | null
          updated_at?: string
        }
        Update: {
          company_address?: string | null
          company_email?: string | null
          company_name?: string
          company_phone?: string | null
          convention_file_id?: string | null
          convention_signed?: boolean
          created_at?: string
          created_by?: string | null
          ends_on?: string
          enrollment_id?: string | null
          evaluated_at?: string | null
          evaluation_comment?: string | null
          evaluation_score?: number | null
          host_kind?: string
          id?: string
          missions?: string | null
          organization_id?: string
          report_file_id?: string | null
          starts_on?: string
          status?: string
          student_id?: string
          supervisor_name?: string | null
          tutor_email?: string | null
          tutor_name?: string | null
          tutor_phone?: string | null
          tutor_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internships_convention_file_id_fkey"
            columns: ["convention_file_id"]
            isOneToOne: false
            referencedRelation: "file_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internships_organization_id_enrollment_id_fkey"
            columns: ["organization_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "internships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internships_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "internships_report_file_id_fkey"
            columns: ["report_file_id"]
            isOneToOne: false
            referencedRelation: "file_objects"
            referencedColumns: ["id"]
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
      learner_attendance: {
        Row: {
          attendance_date: string
          auto_closed: boolean
          class_id: string
          created_at: string
          enrollment_id: string
          entered_at: string
          entry_scan_id: string | null
          exit_scan_id: string | null
          exited_at: string | null
          expected_start: string | null
          group_id: string | null
          id: string
          left_early_minutes: number
          minutes_late: number
          organization_id: string
          room_id: string | null
          student_id: string
          timetable_slot_id: string | null
          updated_at: string
        }
        Insert: {
          attendance_date: string
          auto_closed?: boolean
          class_id: string
          created_at?: string
          enrollment_id: string
          entered_at: string
          entry_scan_id?: string | null
          exit_scan_id?: string | null
          exited_at?: string | null
          expected_start?: string | null
          group_id?: string | null
          id?: string
          left_early_minutes?: number
          minutes_late?: number
          organization_id: string
          room_id?: string | null
          student_id: string
          timetable_slot_id?: string | null
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          auto_closed?: boolean
          class_id?: string
          created_at?: string
          enrollment_id?: string
          entered_at?: string
          entry_scan_id?: string | null
          exit_scan_id?: string | null
          exited_at?: string | null
          expected_start?: string | null
          group_id?: string | null
          id?: string
          left_early_minutes?: number
          minutes_late?: number
          organization_id?: string
          room_id?: string | null
          student_id?: string
          timetable_slot_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learner_attendance_entry_scan_id_fkey"
            columns: ["entry_scan_id"]
            isOneToOne: false
            referencedRelation: "badge_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_attendance_exit_scan_id_fkey"
            columns: ["exit_scan_id"]
            isOneToOne: false
            referencedRelation: "badge_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_attendance_organization_id_class_id_fkey"
            columns: ["organization_id", "class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "learner_attendance_organization_id_enrollment_id_fkey"
            columns: ["organization_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "learner_attendance_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_attendance_organization_id_group_id_fkey"
            columns: ["organization_id", "group_id"]
            isOneToOne: false
            referencedRelation: "training_groups"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "learner_attendance_organization_id_room_id_fkey"
            columns: ["organization_id", "room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "learner_attendance_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "learner_attendance_organization_id_timetable_slot_id_fkey"
            columns: ["organization_id", "timetable_slot_id"]
            isOneToOne: false
            referencedRelation: "timetable_slots"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      learner_competencies: {
        Row: {
          comment: string | null
          competency_id: string
          created_at: string
          enrollment_id: string
          evaluated_by: string | null
          evaluated_on: string
          id: string
          level: string
          organization_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          competency_id: string
          created_at?: string
          enrollment_id: string
          evaluated_by?: string | null
          evaluated_on?: string
          id?: string
          level: string
          organization_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          competency_id?: string
          created_at?: string
          enrollment_id?: string
          evaluated_by?: string | null
          evaluated_on?: string
          id?: string
          level?: string
          organization_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learner_competencies_evaluated_by_fkey"
            columns: ["evaluated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_competencies_organization_id_competency_id_fkey"
            columns: ["organization_id", "competency_id"]
            isOneToOne: false
            referencedRelation: "training_competencies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "learner_competencies_organization_id_enrollment_id_fkey"
            columns: ["organization_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "learner_competencies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_competencies_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
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
          academic_cycle_id: string | null
          created_at: string
          credits_target: number | null
          cycle: string | null
          id: string
          name: string
          organization_id: string
          school_cycle: string | null
          sequence: number
          short_name: string | null
          updated_at: string
        }
        Insert: {
          academic_cycle_id?: string | null
          created_at?: string
          credits_target?: number | null
          cycle?: string | null
          id?: string
          name: string
          organization_id: string
          school_cycle?: string | null
          sequence?: number
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          academic_cycle_id?: string | null
          created_at?: string
          credits_target?: number | null
          cycle?: string | null
          id?: string
          name?: string
          organization_id?: string
          school_cycle?: string | null
          sequence?: number
          short_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "levels_organization_id_academic_cycle_id_fkey"
            columns: ["organization_id", "academic_cycle_id"]
            isOneToOne: false
            referencedRelation: "academic_cycles"
            referencedColumns: ["organization_id", "id"]
          },
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
      message_deliveries: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          organization_id: string | null
          provider: string | null
          provider_message_id: string | null
          purpose: string
          recipient_masked: string
          status: string
        }
        Insert: {
          channel: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          organization_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          purpose?: string
          recipient_masked: string
          status: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          organization_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          purpose?: string
          recipient_masked?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      messaging_quotas: {
        Row: {
          email_limit: number | null
          organization_id: string
          sms_limit: number | null
          updated_at: string
          updated_by: string | null
          whatsapp_limit: number | null
        }
        Insert: {
          email_limit?: number | null
          organization_id: string
          sms_limit?: number | null
          updated_at?: string
          updated_by?: string | null
          whatsapp_limit?: number | null
        }
        Update: {
          email_limit?: number | null
          organization_id?: string
          sms_limit?: number | null
          updated_at?: string
          updated_by?: string | null
          whatsapp_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messaging_quotas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      messaging_settings: {
        Row: {
          default_email_limit: number
          default_sms_limit: number
          default_whatsapp_limit: number
          id: number
          updated_at: string
        }
        Insert: {
          default_email_limit?: number
          default_sms_limit?: number
          default_whatsapp_limit?: number
          id?: number
          updated_at?: string
        }
        Update: {
          default_email_limit?: number
          default_sms_limit?: number
          default_whatsapp_limit?: number
          id?: number
          updated_at?: string
        }
        Relationships: [
          
        ]
      }
      migration_batches: {
        Row: {
          analyzed_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          file_name: string
          file_sha256: string | null
          file_size: number
          headers: string[]
          id: string
          kind: string
          mapping: Json
          options: Json
          organization_id: string
          row_count: number
          started_at: string | null
          stats: Json
          status: string
        }
        Insert: {
          analyzed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          file_name: string
          file_sha256?: string | null
          file_size: number
          headers?: string[]
          id?: string
          kind: string
          mapping?: Json
          options?: Json
          organization_id: string
          row_count?: number
          started_at?: string | null
          stats?: Json
          status?: string
        }
        Update: {
          analyzed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_sha256?: string | null
          file_size?: number
          headers?: string[]
          id?: string
          kind?: string
          mapping?: Json
          options?: Json
          organization_id?: string
          row_count?: number
          started_at?: string | null
          stats?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "migration_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      migration_rows: {
        Row: {
          batch_id: string
          data: Json
          duplicate_reasons: string[] | null
          duplicate_score: number | null
          duplicate_student_id: string | null
          group_key: string | null
          id: string
          issues: Json
          normalized: Json
          organization_id: string
          processed_at: string | null
          resolution: string | null
          row_number: number
          status: string
          student_id: string | null
        }
        Insert: {
          batch_id: string
          data: Json
          duplicate_reasons?: string[] | null
          duplicate_score?: number | null
          duplicate_student_id?: string | null
          group_key?: string | null
          id?: string
          issues?: Json
          normalized?: Json
          organization_id: string
          processed_at?: string | null
          resolution?: string | null
          row_number: number
          status?: string
          student_id?: string | null
        }
        Update: {
          batch_id?: string
          data?: Json
          duplicate_reasons?: string[] | null
          duplicate_score?: number | null
          duplicate_student_id?: string | null
          group_key?: string | null
          id?: string
          issues?: Json
          normalized?: Json
          organization_id?: string
          processed_at?: string | null
          resolution?: string | null
          row_number?: number
          status?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "migration_rows_organization_id_batch_id_fkey"
            columns: ["organization_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "migration_batches"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "migration_rows_organization_id_duplicate_student_id_fkey"
            columns: ["organization_id", "duplicate_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "migration_rows_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
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
          email_verification: string
          email_verified_at: string | null
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
          email_verification?: string
          email_verified_at?: string | null
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
          email_verification?: string
          email_verified_at?: string | null
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
      payment_provider_events: {
        Row: {
          created_at: string
          event_key: string
          id: string
          mode: string
          organization_id: string | null
          payload: Json
          provider: string
          provider_transaction_id: string | null
          status: string
          transaction_id: string | null
        }
        Insert: {
          created_at?: string
          event_key: string
          id?: string
          mode: string
          organization_id?: string | null
          payload?: Json
          provider: string
          provider_transaction_id?: string | null
          status: string
          transaction_id?: string | null
        }
        Update: {
          created_at?: string
          event_key?: string
          id?: string
          mode?: string
          organization_id?: string | null
          payload?: Json
          provider?: string
          provider_transaction_id?: string | null
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_provider_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_provider_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          }
        ]
      }
      payment_providers: {
        Row: {
          code: string
          created_at: string
          description: string | null
          is_active: boolean
          name: string
          supports_refund: boolean
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name: string
          supports_refund?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name?: string
          supports_refund?: boolean
        }
        Relationships: [
          
        ]
      }
      payment_simulations: {
        Row: {
          amount: number
          created_at: string
          outcome: string
          reference: string
        }
        Insert: {
          amount: number
          created_at?: string
          outcome: string
          reference: string
        }
        Update: {
          amount?: number
          created_at?: string
          outcome?: string
          reference?: string
        }
        Relationships: [
          
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          checkout_url: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          failure_reason: string | null
          id: string
          internal_reference: string
          invoice_id: string
          mode: string
          organization_id: string
          paid_at: string | null
          payment_method: string | null
          provider: string
          provider_response: Json
          provider_transaction_id: string | null
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          checkout_url?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          failure_reason?: string | null
          id?: string
          internal_reference: string
          invoice_id: string
          mode: string
          organization_id: string
          paid_at?: string | null
          payment_method?: string | null
          provider: string
          provider_response?: Json
          provider_transaction_id?: string | null
          status?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          checkout_url?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          failure_reason?: string | null
          id?: string
          internal_reference?: string
          invoice_id?: string
          mode?: string
          organization_id?: string
          paid_at?: string | null
          payment_method?: string | null
          provider?: string
          provider_response?: Json
          provider_transaction_id?: string | null
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_organization_id_invoice_id_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "payment_transactions_organization_id_subscription_id_fkey"
            columns: ["organization_id", "subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "payment_transactions_provider_fkey"
            columns: ["provider"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["code"]
          }
        ]
      }
      payment_webhooks: {
        Row: {
          error: string | null
          id: string
          ip: string | null
          mode: string | null
          organization_id: string | null
          payload: Json
          processing_status: string
          provider: string
          provider_transaction_id: string | null
          received_at: string
          result: Json | null
          transaction_id: string | null
        }
        Insert: {
          error?: string | null
          id?: string
          ip?: string | null
          mode?: string | null
          organization_id?: string | null
          payload?: Json
          processing_status?: string
          provider: string
          provider_transaction_id?: string | null
          received_at?: string
          result?: Json | null
          transaction_id?: string | null
        }
        Update: {
          error?: string | null
          id?: string
          ip?: string | null
          mode?: string | null
          organization_id?: string | null
          payload?: Json
          processing_status?: string
          provider?: string
          provider_transaction_id?: string | null
          received_at?: string
          result?: Json | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_webhooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_webhooks_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
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
      platform_billing_settings: {
        Row: {
          checkout_expiry_hours: number
          expire_after_days: number
          id: number
          past_due_days: number
          renewal_notice_days: number
          restrict_after_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          checkout_expiry_hours?: number
          expire_after_days?: number
          id?: number
          past_due_days?: number
          renewal_notice_days?: number
          restrict_after_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          checkout_expiry_hours?: number
          expire_after_days?: number
          id?: number
          past_due_days?: number
          renewal_notice_days?: number
          restrict_after_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_billing_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      platform_integrations: {
        Row: {
          config: Json
          enabled: boolean
          last_test_at: string | null
          last_test_message: string | null
          last_test_ok: boolean | null
          provider: string
          secret_ciphertext: string | null
          secret_hint: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          enabled?: boolean
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_ok?: boolean | null
          provider: string
          secret_ciphertext?: string | null
          secret_hint?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          enabled?: boolean
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_ok?: boolean | null
          provider?: string
          secret_ciphertext?: string | null
          secret_hint?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          
        ]
      }
      platform_security_settings: {
        Row: {
          captcha_after_failures: number
          email_verification_required: boolean
          id: number
          lockout_minutes: number
          lockout_threshold: number
          mfa_required_sensitive: boolean
          updated_at: string
        }
        Insert: {
          captcha_after_failures?: number
          email_verification_required?: boolean
          id?: number
          lockout_minutes?: number
          lockout_threshold?: number
          mfa_required_sensitive?: boolean
          updated_at?: string
        }
        Update: {
          captcha_after_failures?: number
          email_verification_required?: boolean
          id?: number
          lockout_minutes?: number
          lockout_threshold?: number
          mfa_required_sensitive?: boolean
          updated_at?: string
        }
        Relationships: [
          
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
      program_tracks: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          organization_id: string
          program_id: string
          responsible_id: string | null
          starts_at_level_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          organization_id: string
          program_id: string
          responsible_id?: string | null
          starts_at_level_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          organization_id?: string
          program_id?: string
          responsible_id?: string | null
          starts_at_level_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_tracks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_tracks_organization_id_program_id_fkey"
            columns: ["organization_id", "program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "program_tracks_organization_id_responsible_id_fkey"
            columns: ["organization_id", "responsible_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "program_tracks_organization_id_starts_at_level_id_fkey"
            columns: ["organization_id", "starts_at_level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      programs: {
        Row: {
          academic_cycle_id: string | null
          admission_conditions: string | null
          certificate_title: string | null
          code: string
          created_at: string
          default_installments: number | null
          degree_title: string | null
          department_id: string | null
          description: string | null
          duration_hours: number | null
          duration_label: string | null
          duration_years: number | null
          faculty_id: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          organization_id: string
          registration_fee: number | null
          responsible_id: string | null
          school_cycle: string | null
          search_text: string | null
          syllabus: string | null
          track_type: string | null
          training_level: string | null
          tuition_amount: number | null
          updated_at: string
        }
        Insert: {
          academic_cycle_id?: string | null
          admission_conditions?: string | null
          certificate_title?: string | null
          code: string
          created_at?: string
          default_installments?: number | null
          degree_title?: string | null
          department_id?: string | null
          description?: string | null
          duration_hours?: number | null
          duration_label?: string | null
          duration_years?: number | null
          faculty_id?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          organization_id: string
          registration_fee?: number | null
          responsible_id?: string | null
          school_cycle?: string | null
          search_text?: never
          syllabus?: string | null
          track_type?: string | null
          training_level?: string | null
          tuition_amount?: number | null
          updated_at?: string
        }
        Update: {
          academic_cycle_id?: string | null
          admission_conditions?: string | null
          certificate_title?: string | null
          code?: string
          created_at?: string
          default_installments?: number | null
          degree_title?: string | null
          department_id?: string | null
          description?: string | null
          duration_hours?: number | null
          duration_label?: string | null
          duration_years?: number | null
          faculty_id?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          organization_id?: string
          registration_fee?: number | null
          responsible_id?: string | null
          school_cycle?: string | null
          search_text?: never
          syllabus?: string | null
          track_type?: string | null
          training_level?: string | null
          tuition_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_organization_id_academic_cycle_id_fkey"
            columns: ["organization_id", "academic_cycle_id"]
            isOneToOne: false
            referencedRelation: "academic_cycles"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "programs_organization_id_department_id_fkey"
            columns: ["organization_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "programs_organization_id_faculty_id_fkey"
            columns: ["organization_id", "faculty_id"]
            isOneToOne: false
            referencedRelation: "faculties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "programs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_organization_id_responsible_id_fkey"
            columns: ["organization_id", "responsible_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["organization_id", "id"]
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
          equipment: string | null
          id: string
          is_available: boolean
          name: string
          number: string | null
          organization_id: string
          room_type: string | null
          updated_at: string
        }
        Insert: {
          building?: string | null
          capacity?: number | null
          created_at?: string
          equipment?: string | null
          id?: string
          is_available?: boolean
          name: string
          number?: string | null
          organization_id: string
          room_type?: string | null
          updated_at?: string
        }
        Update: {
          building?: string | null
          capacity?: number | null
          created_at?: string
          equipment?: string | null
          id?: string
          is_available?: boolean
          name?: string
          number?: string | null
          organization_id?: string
          room_type?: string | null
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
      semester_results: {
        Row: {
          absences: number
          academic_period_id: string
          average: number | null
          class_id: string
          compensated: boolean
          computed_at: string
          credits_earned: number
          credits_total: number
          decision: string | null
          enrollment_id: string
          has_retake: boolean
          id: string
          organization_id: string
          population: number | null
          published_at: string | null
          rank: number | null
          retake_needed: boolean
          student_id: string
          validated: boolean
        }
        Insert: {
          absences?: number
          academic_period_id: string
          average?: number | null
          class_id: string
          compensated?: boolean
          computed_at?: string
          credits_earned?: number
          credits_total?: number
          decision?: string | null
          enrollment_id: string
          has_retake?: boolean
          id?: string
          organization_id: string
          population?: number | null
          published_at?: string | null
          rank?: number | null
          retake_needed?: boolean
          student_id: string
          validated?: boolean
        }
        Update: {
          absences?: number
          academic_period_id?: string
          average?: number | null
          class_id?: string
          compensated?: boolean
          computed_at?: string
          credits_earned?: number
          credits_total?: number
          decision?: string | null
          enrollment_id?: string
          has_retake?: boolean
          id?: string
          organization_id?: string
          population?: number | null
          published_at?: string | null
          rank?: number | null
          retake_needed?: boolean
          student_id?: string
          validated?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "semester_results_organization_id_academic_period_id_fkey"
            columns: ["organization_id", "academic_period_id"]
            isOneToOne: false
            referencedRelation: "academic_periods"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "semester_results_organization_id_class_id_fkey"
            columns: ["organization_id", "class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "semester_results_organization_id_enrollment_id_fkey"
            columns: ["organization_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "semester_results_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semester_results_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
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
          academic_rank: string | null
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
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
          academic_rank?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
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
          academic_rank?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
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
            foreignKeyName: "staff_members_organization_id_department_id_fkey"
            columns: ["organization_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["organization_id", "id"]
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
      student_badges: {
        Row: {
          id: string
          issued_at: string
          issued_by: string | null
          last_printed_at: string | null
          number: string
          organization_id: string
          printed_count: number
          replaces_badge_id: string | null
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          status: string
          student_id: string
          token: string
        }
        Insert: {
          id?: string
          issued_at?: string
          issued_by?: string | null
          last_printed_at?: string | null
          number: string
          organization_id: string
          printed_count?: number
          replaces_badge_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          status?: string
          student_id: string
          token?: string
        }
        Update: {
          id?: string
          issued_at?: string
          issued_by?: string | null
          last_printed_at?: string | null
          number?: string
          organization_id?: string
          printed_count?: number
          replaces_badge_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          status?: string
          student_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_badges_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_badges_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "student_badges_replaces_badge_id_fkey"
            columns: ["replaces_badge_id"]
            isOneToOne: false
            referencedRelation: "student_badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_badges_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      student_diplomas: {
        Row: {
          academic_year_id: string | null
          batch_id: string | null
          conferred_on: string | null
          created_at: string
          created_by: string | null
          file_id: string | null
          id: string
          issued_document_id: string | null
          issued_on: string | null
          issuer: string | null
          kind: string
          level_id: string | null
          mention: string | null
          notes: string | null
          number: string | null
          organization_id: string
          program_id: string | null
          revoked_at: string | null
          revoked_reason: string | null
          source: string
          status: string
          student_id: string
          title: string
          year_label: string | null
        }
        Insert: {
          academic_year_id?: string | null
          batch_id?: string | null
          conferred_on?: string | null
          created_at?: string
          created_by?: string | null
          file_id?: string | null
          id?: string
          issued_document_id?: string | null
          issued_on?: string | null
          issuer?: string | null
          kind?: string
          level_id?: string | null
          mention?: string | null
          notes?: string | null
          number?: string | null
          organization_id: string
          program_id?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          source?: string
          status?: string
          student_id: string
          title: string
          year_label?: string | null
        }
        Update: {
          academic_year_id?: string | null
          batch_id?: string | null
          conferred_on?: string | null
          created_at?: string
          created_by?: string | null
          file_id?: string | null
          id?: string
          issued_document_id?: string | null
          issued_on?: string | null
          issuer?: string | null
          kind?: string
          level_id?: string | null
          mention?: string | null
          notes?: string | null
          number?: string | null
          organization_id?: string
          program_id?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          source?: string
          status?: string
          student_id?: string
          title?: string
          year_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_diplomas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_diplomas_issued_document_id_fkey"
            columns: ["issued_document_id"]
            isOneToOne: false
            referencedRelation: "issued_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_diplomas_organization_id_academic_year_id_fkey"
            columns: ["organization_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "student_diplomas_organization_id_batch_id_fkey"
            columns: ["organization_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "migration_batches"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "student_diplomas_organization_id_file_id_fkey"
            columns: ["organization_id", "file_id"]
            isOneToOne: false
            referencedRelation: "file_objects"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "student_diplomas_organization_id_level_id_fkey"
            columns: ["organization_id", "level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "student_diplomas_organization_id_program_id_fkey"
            columns: ["organization_id", "program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "student_diplomas_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
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
      student_history: {
        Row: {
          absences: number | null
          absences_justified: number | null
          academic_year_id: string | null
          average: number | null
          batch_id: string | null
          class_name: string | null
          created_at: string
          created_by: string | null
          decision: string | null
          id: string
          level_name: string | null
          notes: string | null
          organization_id: string
          program_name: string | null
          rank: number | null
          source: string
          student_id: string
          year_label: string
        }
        Insert: {
          absences?: number | null
          absences_justified?: number | null
          academic_year_id?: string | null
          average?: number | null
          batch_id?: string | null
          class_name?: string | null
          created_at?: string
          created_by?: string | null
          decision?: string | null
          id?: string
          level_name?: string | null
          notes?: string | null
          organization_id: string
          program_name?: string | null
          rank?: number | null
          source?: string
          student_id: string
          year_label: string
        }
        Update: {
          absences?: number | null
          absences_justified?: number | null
          academic_year_id?: string | null
          average?: number | null
          batch_id?: string | null
          class_name?: string | null
          created_at?: string
          created_by?: string | null
          decision?: string | null
          id?: string
          level_name?: string | null
          notes?: string | null
          organization_id?: string
          program_name?: string | null
          rank?: number | null
          source?: string
          student_id?: string
          year_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_history_organization_id_academic_year_id_fkey"
            columns: ["organization_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "student_history_organization_id_batch_id_fkey"
            columns: ["organization_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "migration_batches"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "student_history_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      student_history_grades: {
        Row: {
          academic_year_id: string | null
          appreciation: string | null
          batch_id: string | null
          coefficient: number
          created_at: string
          id: string
          max_score: number
          organization_id: string
          period_label: string | null
          score: number
          source: string
          student_id: string
          subject: string
          year_label: string
        }
        Insert: {
          academic_year_id?: string | null
          appreciation?: string | null
          batch_id?: string | null
          coefficient?: number
          created_at?: string
          id?: string
          max_score?: number
          organization_id: string
          period_label?: string | null
          score: number
          source?: string
          student_id: string
          subject: string
          year_label: string
        }
        Update: {
          academic_year_id?: string | null
          appreciation?: string | null
          batch_id?: string | null
          coefficient?: number
          created_at?: string
          id?: string
          max_score?: number
          organization_id?: string
          period_label?: string | null
          score?: number
          source?: string
          student_id?: string
          subject?: string
          year_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_history_grades_organization_id_academic_year_id_fkey"
            columns: ["organization_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "student_history_grades_organization_id_batch_id_fkey"
            columns: ["organization_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "migration_batches"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "student_history_grades_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      student_history_payments: {
        Row: {
          academic_year_id: string | null
          amount: number
          batch_id: string | null
          created_at: string
          id: string
          label: string
          method: string | null
          organization_id: string
          paid_on: string | null
          reference: string | null
          source: string
          student_id: string
          year_label: string | null
        }
        Insert: {
          academic_year_id?: string | null
          amount: number
          batch_id?: string | null
          created_at?: string
          id?: string
          label: string
          method?: string | null
          organization_id: string
          paid_on?: string | null
          reference?: string | null
          source?: string
          student_id: string
          year_label?: string | null
        }
        Update: {
          academic_year_id?: string | null
          amount?: number
          batch_id?: string | null
          created_at?: string
          id?: string
          label?: string
          method?: string | null
          organization_id?: string
          paid_on?: string | null
          reference?: string | null
          source?: string
          student_id?: string
          year_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_history_payments_organization_id_academic_year_id_fkey"
            columns: ["organization_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "student_history_payments_organization_id_batch_id_fkey"
            columns: ["organization_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "migration_batches"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "student_history_payments_organization_id_student_id_fkey"
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
          education_level: string | null
          email: string | null
          entry_year: number | null
          exit_year: number | null
          first_name: string
          id: string
          import_batch_id: string | null
          last_name: string
          legacy_matricule: string | null
          legacy_program: string | null
          matricule: string
          national_id: string | null
          nationality: string | null
          notes: string | null
          organization_id: string
          origin: string
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
          education_level?: string | null
          email?: string | null
          entry_year?: number | null
          exit_year?: number | null
          first_name: string
          id?: string
          import_batch_id?: string | null
          last_name: string
          legacy_matricule?: string | null
          legacy_program?: string | null
          matricule?: string
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          organization_id: string
          origin?: string
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
          education_level?: string | null
          email?: string | null
          entry_year?: number | null
          exit_year?: number | null
          first_name?: string
          id?: string
          import_batch_id?: string | null
          last_name?: string
          legacy_matricule?: string | null
          legacy_program?: string | null
          matricule?: string
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          organization_id?: string
          origin?: string
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
            foreignKeyName: "students_import_batch_fk"
            columns: ["organization_id", "import_batch_id"]
            isOneToOne: false
            referencedRelation: "migration_batches"
            referencedColumns: ["organization_id", "id"]
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
          coefficient: number | null
          color: string | null
          created_at: string
          credits: number | null
          hours_cm: number | null
          hours_td: number | null
          hours_tp: number | null
          id: string
          is_active: boolean
          kind: string
          name: string
          organization_id: string
          program_id: string | null
          school_cycles: string[]
          teaching_types: string[]
          teaching_unit_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          coefficient?: number | null
          color?: string | null
          created_at?: string
          credits?: number | null
          hours_cm?: number | null
          hours_td?: number | null
          hours_tp?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          organization_id: string
          program_id?: string | null
          school_cycles?: string[]
          teaching_types?: string[]
          teaching_unit_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          coefficient?: number | null
          color?: string | null
          created_at?: string
          credits?: number | null
          hours_cm?: number | null
          hours_td?: number | null
          hours_tp?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          organization_id?: string
          program_id?: string | null
          school_cycles?: string[]
          teaching_types?: string[]
          teaching_unit_id?: string | null
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
          },
          {
            foreignKeyName: "subjects_organization_id_teaching_unit_id_fkey"
            columns: ["organization_id", "teaching_unit_id"]
            isOneToOne: false
            referencedRelation: "teaching_units"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      subscription_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json
          organization_id: string
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          organization_id: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      subscription_features: {
        Row: {
          enabled: boolean
          feature_code: string
          limit_value: number | null
          plan_id: string
        }
        Insert: {
          enabled?: boolean
          feature_code: string
          limit_value?: number | null
          plan_id: string
        }
        Update: {
          enabled?: boolean
          feature_code?: string
          limit_value?: number | null
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          }
        ]
      }
      subscription_invoices: {
        Row: {
          amount: number
          billing_interval: string
          created_at: string
          created_by: string | null
          currency: string
          discount_amount: number
          due_at: string
          id: string
          invoice_number: string
          issued_at: string
          kind: string
          list_amount: number
          organization_id: string
          paid_at: string | null
          payment_method: string | null
          payment_transaction_id: string | null
          pdf_url: string | null
          period_end: string | null
          period_start: string | null
          plan_code: string
          plan_id: string
          plan_name: string
          status: string
          subscription_id: string
          unit_annual_price: number
          unit_monthly_price: number
          updated_at: string
        }
        Insert: {
          amount: number
          billing_interval: string
          created_at?: string
          created_by?: string | null
          currency: string
          discount_amount?: number
          due_at?: string
          id?: string
          invoice_number: string
          issued_at?: string
          kind?: string
          list_amount: number
          organization_id: string
          paid_at?: string | null
          payment_method?: string | null
          payment_transaction_id?: string | null
          pdf_url?: string | null
          period_end?: string | null
          period_start?: string | null
          plan_code: string
          plan_id: string
          plan_name: string
          status?: string
          subscription_id: string
          unit_annual_price: number
          unit_monthly_price: number
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_interval?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_amount?: number
          due_at?: string
          id?: string
          invoice_number?: string
          issued_at?: string
          kind?: string
          list_amount?: number
          organization_id?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_transaction_id?: string | null
          pdf_url?: string | null
          period_end?: string | null
          period_start?: string | null
          plan_code?: string
          plan_id?: string
          plan_name?: string
          status?: string
          subscription_id?: string
          unit_annual_price?: number
          unit_monthly_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_organization_id_subscription_id_fkey"
            columns: ["organization_id", "subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "subscription_invoices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_tx_fk"
            columns: ["organization_id", "payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          duplicate_of_invoice: boolean
          id: string
          invoice_id: string
          method: string | null
          mode: string
          note: string | null
          organization_id: string
          paid_at: string
          provider: string
          recorded_by: string | null
          reference: string
          subscription_id: string
          transaction_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          duplicate_of_invoice?: boolean
          id?: string
          invoice_id: string
          method?: string | null
          mode: string
          note?: string | null
          organization_id: string
          paid_at: string
          provider: string
          recorded_by?: string | null
          reference: string
          subscription_id: string
          transaction_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          duplicate_of_invoice?: boolean
          id?: string
          invoice_id?: string
          method?: string | null
          mode?: string
          note?: string | null
          organization_id?: string
          paid_at?: string
          provider?: string
          recorded_by?: string | null
          reference?: string
          subscription_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_organization_id_invoice_id_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "subscription_payments_organization_id_subscription_id_fkey"
            columns: ["organization_id", "subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "subscription_payments_organization_id_transaction_id_fkey"
            columns: ["organization_id", "transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "subscription_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      subscription_plans: {
        Row: {
          annual_discount_percent: number
          annual_list_price: number | null
          annual_price: number
          annual_savings: number | null
          audience: string | null
          code: string
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          monthly_price: number
          name: string
          org_types: Database["public"]["Enums"]["organization_type"][]
          sort_order: number
          trial_days: number
          updated_at: string
        }
        Insert: {
          annual_discount_percent?: number
          annual_list_price?: never
          annual_price: number
          annual_savings?: never
          audience?: string | null
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_price: number
          name: string
          org_types?: Database["public"]["Enums"]["organization_type"][]
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Update: {
          annual_discount_percent?: number
          annual_list_price?: never
          annual_price?: number
          annual_savings?: never
          audience?: string | null
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_price?: number
          name?: string
          org_types?: Database["public"]["Enums"]["organization_type"][]
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Relationships: [
          
        ]
      }
      subscriptions: {
        Row: {
          annual_price: number
          billing_interval: string
          cancel_at_period_end: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          components: string[]
          created_at: string
          currency: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          is_demo: boolean
          monthly_price: number
          next_billing_date: string | null
          organization_id: string
          plan_id: string
          status: string
          status_changed_at: string
          trial_end: string | null
          trial_start: string | null
          updated_at: string
        }
        Insert: {
          annual_price: number
          billing_interval?: string
          cancel_at_period_end?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          components?: string[]
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_demo?: boolean
          monthly_price: number
          next_billing_date?: string | null
          organization_id: string
          plan_id: string
          status?: string
          status_changed_at?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
        }
        Update: {
          annual_price?: number
          billing_interval?: string
          cancel_at_period_end?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          components?: string[]
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_demo?: boolean
          monthly_price?: number
          next_billing_date?: string | null
          organization_id?: string
          plan_id?: string
          status?: string
          status_changed_at?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          }
        ]
      }
      teaching_units: {
        Row: {
          category: string | null
          code: string
          coefficient: number
          created_at: string
          credits: number
          description: string | null
          id: string
          is_active: boolean
          is_optional: boolean
          level_id: string | null
          name: string
          organization_id: string
          program_id: string | null
          responsible_id: string | null
          semester_no: number
          track_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          code: string
          coefficient?: number
          created_at?: string
          credits?: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_optional?: boolean
          level_id?: string | null
          name: string
          organization_id: string
          program_id?: string | null
          responsible_id?: string | null
          semester_no?: number
          track_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string
          coefficient?: number
          created_at?: string
          credits?: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_optional?: boolean
          level_id?: string | null
          name?: string
          organization_id?: string
          program_id?: string | null
          responsible_id?: string | null
          semester_no?: number
          track_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaching_units_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_units_organization_id_level_id_fkey"
            columns: ["organization_id", "level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "teaching_units_organization_id_program_id_fkey"
            columns: ["organization_id", "program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "teaching_units_organization_id_responsible_id_fkey"
            columns: ["organization_id", "responsible_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "teaching_units_organization_id_track_id_fkey"
            columns: ["organization_id", "track_id"]
            isOneToOne: false
            referencedRelation: "program_tracks"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      theses: {
        Row: {
          academic_year_id: string | null
          co_director_name: string | null
          created_at: string
          created_by: string | null
          director_id: string | null
          director_name: string | null
          enrollment_id: string | null
          file_id: string | null
          grade: number | null
          id: string
          jury: string | null
          kind: string
          mention: string | null
          organization_id: string
          status: string
          student_id: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          co_director_name?: string | null
          created_at?: string
          created_by?: string | null
          director_id?: string | null
          director_name?: string | null
          enrollment_id?: string | null
          file_id?: string | null
          grade?: number | null
          id?: string
          jury?: string | null
          kind?: string
          mention?: string | null
          organization_id: string
          status?: string
          student_id: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          co_director_name?: string | null
          created_at?: string
          created_by?: string | null
          director_id?: string | null
          director_name?: string | null
          enrollment_id?: string | null
          file_id?: string | null
          grade?: number | null
          id?: string
          jury?: string | null
          kind?: string
          mention?: string | null
          organization_id?: string
          status?: string
          student_id?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "theses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theses_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theses_organization_id_academic_year_id_fkey"
            columns: ["organization_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "theses_organization_id_director_id_fkey"
            columns: ["organization_id", "director_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "theses_organization_id_enrollment_id_fkey"
            columns: ["organization_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "theses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theses_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          group_id: string | null
          id: string
          label: string | null
          organization_id: string
          room_id: string | null
          session_type: string | null
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
          group_id?: string | null
          id?: string
          label?: string | null
          organization_id: string
          room_id?: string | null
          session_type?: string | null
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
          group_id?: string | null
          id?: string
          label?: string | null
          organization_id?: string
          room_id?: string | null
          session_type?: string | null
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
            foreignKeyName: "timetable_slots_organization_id_group_id_fkey"
            columns: ["organization_id", "group_id"]
            isOneToOne: false
            referencedRelation: "training_groups"
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
      training_competencies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          program_id: string
          sequence: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          program_id: string
          sequence?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          program_id?: string
          sequence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_competencies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_competencies_organization_id_program_id_fkey"
            columns: ["organization_id", "program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      training_groups: {
        Row: {
          archived_at: string | null
          capacity: number | null
          class_id: string
          created_at: string
          id: string
          name: string
          organization_id: string
          room_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          capacity?: number | null
          class_id: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          room_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          capacity?: number | null
          class_id?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          room_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_groups_organization_id_class_id_fkey"
            columns: ["organization_id", "class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "training_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_groups_organization_id_room_id_fkey"
            columns: ["organization_id", "room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      ue_results: {
        Row: {
          academic_period_id: string
          average: number | null
          class_id: string
          computed_at: string
          credits: number
          credits_earned: number
          enrollment_id: string
          id: string
          organization_id: string
          retake_average: number | null
          session1_average: number | null
          status: string
          student_id: string
          subjects: Json
          teaching_unit_id: string
        }
        Insert: {
          academic_period_id: string
          average?: number | null
          class_id: string
          computed_at?: string
          credits?: number
          credits_earned?: number
          enrollment_id: string
          id?: string
          organization_id: string
          retake_average?: number | null
          session1_average?: number | null
          status: string
          student_id: string
          subjects?: Json
          teaching_unit_id: string
        }
        Update: {
          academic_period_id?: string
          average?: number | null
          class_id?: string
          computed_at?: string
          credits?: number
          credits_earned?: number
          enrollment_id?: string
          id?: string
          organization_id?: string
          retake_average?: number | null
          session1_average?: number | null
          status?: string
          student_id?: string
          subjects?: Json
          teaching_unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ue_results_organization_id_academic_period_id_fkey"
            columns: ["organization_id", "academic_period_id"]
            isOneToOne: false
            referencedRelation: "academic_periods"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ue_results_organization_id_class_id_fkey"
            columns: ["organization_id", "class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ue_results_organization_id_enrollment_id_fkey"
            columns: ["organization_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ue_results_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ue_results_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ue_results_organization_id_teaching_unit_id_fkey"
            columns: ["organization_id", "teaching_unit_id"]
            isOneToOne: false
            referencedRelation: "teaching_units"
            referencedColumns: ["organization_id", "id"]
          }
        ]
      }
      whatsapp_templates: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          language: string
          name: string
          variables_count: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          language?: string
          name: string
          variables_count?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          language?: string
          name?: string
          variables_count?: number
        }
        Relationships: [
          
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
      billing_access_state: {
        Args: {
          p_org: string
        }
        Returns: Json
      }
      billing_attach_checkout: {
        Args: {
          p_transaction: string
          p_provider_tx: string
          p_checkout_url: string
          p_response: Json
        }
        Returns: undefined
      }
      billing_cancel: {
        Args: {
          p_org: string
          p_reason?: string
        }
        Returns: undefined
      }
      billing_change_trial_plan: {
        Args: {
          p_org: string
          p_plan_code: string
          p_interval: string
        }
        Returns: undefined
      }
      billing_confirm_payment: {
        Args: {
          p_provider: string
          p_mode: string
          p_provider_tx: string
          p_reference: string
          p_amount: number
          p_currency: string
          p_method?: string
          p_response?: Json
        }
        Returns: Json
      }
      billing_fail_payment: {
        Args: {
          p_provider: string
          p_mode: string
          p_provider_tx: string
          p_reference: string
          p_status: string
          p_reason: string
          p_response?: Json
        }
        Returns: Json
      }
      billing_process_lifecycle: {
        Args: never
        Returns: Json
      }
      billing_resume: {
        Args: {
          p_org: string
        }
        Returns: undefined
      }
      billing_start_checkout: {
        Args: {
          p_org: string
          p_plan_code: string
          p_interval: string
          p_provider: string
          p_mode: string
        }
        Returns: Json
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
      compute_university_results: {
        Args: {
          p_class_id: string
          p_period_id: string
        }
        Returns: number
      }
      create_component_space: {
        Args: {
          p_parent: string
          p_component: string
          p_name?: string
        }
        Returns: string
      }
      create_enrollment_application: {
        Args: {
          p_organization_id: string
          p_payload: Json
        }
        Returns: string
      }
      create_legacy_student: {
        Args: {
          p_organization_id: string
          p_student: Json
          p_history?: Json
          p_diploma?: Json
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
      create_past_academic_years: {
        Args: {
          p_organization_id: string
          p_from: number
          p_to: number
        }
        Returns: number
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
      delete_training_program: {
        Args: {
          p_program_id: string
        }
        Returns: undefined
      }
      deliberation_close: {
        Args: {
          p_deliberation_id: string
        }
        Returns: undefined
      }
      deliberation_decide: {
        Args: {
          p_deliberation_id: string
          p_student_id: string
          p_decision: string
          p_comment?: string
          p_validate_credits?: boolean
        }
        Returns: string
      }
      deliberation_prepare: {
        Args: {
          p_deliberation_id: string
        }
        Returns: number
      }
      deliberation_reopen: {
        Args: {
          p_deliberation_id: string
          p_reason: string
        }
        Returns: undefined
      }
      email_verification_state: {
        Args: {
          p_org: string
        }
        Returns: Json
      }
      enroll_learner: {
        Args: {
          p_organization_id: string
          p_payload: Json
        }
        Returns: Json
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
      find_student_duplicates: {
        Args: {
          p_organization_id: string
          p_last_name: string
          p_first_name: string
          p_birth_date: string
          p_matricule?: string
          p_limit?: number
        }
        Returns: {
          student_id: string
          full_name: string
          matricule: string
          legacy_matricule: string
          birth_date: string
          status: string
          archived: boolean
          score: number
          reasons: string[]
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
      historical_overview: {
        Args: {
          p_organization_id: string
        }
        Returns: Json
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
      is_platform_admin: {
        Args: never
        Returns: boolean
      }
      issue_session_badges: {
        Args: {
          p_class_id: string
        }
        Returns: number
      }
      issue_staff_badge: {
        Args: {
          p_staff_id: string
          p_reason?: string
        }
        Returns: string
      }
      issue_student_badge: {
        Args: {
          p_student_id: string
          p_reason?: string
        }
        Returns: string
      }
      learner_attendance_summary: {
        Args: {
          p_student_id: string
          p_from?: string
          p_to?: string
        }
        Returns: Json
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
      login_guard: {
        Args: {
          p_identifier_hash: string
          p_ip_hash: string
        }
        Returns: Json
      }
      login_record: {
        Args: {
          p_identifier_hash: string
          p_ip_hash: string
          p_success: boolean
        }
        Returns: undefined
      }
      mark_thread_read: {
        Args: {
          p_thread_id: string
        }
        Returns: undefined
      }
      message_contacts: {
        Args: {
          p_organization_id: string
        }
        Returns: {
          user_id: string
          name: string
          kind: string
          detail: string
        }[]
      }
      messaging_quota_state: {
        Args: {
          p_org: string
          p_channel: string
        }
        Returns: Json
      }
      migration_analyze: {
        Args: {
          p_batch_id: string
          p_mapping: Json
          p_options: Json
        }
        Returns: Json
      }
      migration_append_rows: {
        Args: {
          p_batch_id: string
          p_rows: Json
        }
        Returns: number
      }
      migration_cancel: {
        Args: {
          p_batch_id: string
        }
        Returns: undefined
      }
      migration_create_batch: {
        Args: {
          p_organization_id: string
          p_kind: string
          p_file_name: string
          p_file_size: number
          p_file_sha256: string
          p_headers: string[]
        }
        Returns: string
      }
      migration_import_chunk: {
        Args: {
          p_batch_id: string
          p_limit?: number
        }
        Returns: Json
      }
      migration_resolve: {
        Args: {
          p_batch_id: string
          p_row_ids: string[]
          p_resolution: string
        }
        Returns: number
      }
      module4_overview: {
        Args: {
          p_org: string
        }
        Returns: Json
      }
      my_badge: {
        Args: {
          p_org: string
        }
        Returns: Json
      }
      my_class_ids: {
        Args: {
          p_organization_id: string
        }
        Returns: string[]
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
      my_security_state: {
        Args: never
        Returns: Json
      }
      my_sessions: {
        Args: never
        Returns: {
          id: string
          created_at: string
          updated_at: string
          user_agent: string
          ip: string
          aal: string
          current: boolean
        }[]
      }
      my_threads: {
        Args: {
          p_organization_id: string
        }
        Returns: {
          id: string
          subject: string
          last_message_at: string
          participants: string
          last_message: string
          unread: boolean
        }[]
      }
      organization_portal: {
        Args: {
          p_code: string
        }
        Returns: {
          id: string
          name: string
          short_name: string
          code: string
          type: Database["public"]["Enums"]["organization_type"]
          city: string
          country: string
          primary_color: string
          secondary_color: string
          has_logo: boolean
          is_demo: boolean
        }[]
      }
      organization_portal_logo: {
        Args: {
          p_code: string
        }
        Returns: {
          mime_type: string
          content: string
        }[]
      }
      platform_add_org_admin: {
        Args: {
          p_organization_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      platform_billing_overview: {
        Args: never
        Returns: Json
      }
      platform_issue_invoice: {
        Args: {
          p_org: string
          p_plan_code: string
          p_interval: string
        }
        Returns: string
      }
      platform_messaging_usage: {
        Args: never
        Returns: {
          organization_id: string
          name: string
          code: string
          email_used: number
          sms_used: number
          whatsapp_used: number
          email_limit: number
          sms_limit: number
          whatsapp_limit: number
          custom: boolean
          email_override: number
          sms_override: number
          whatsapp_override: number
        }[]
      }
      platform_overview: {
        Args: never
        Returns: {
          id: string
          name: string
          code: string
          type: string
          city: string
          status: string
          is_demo: boolean
          created_at: string
          students: number
          staff: number
          members: number
          admins: number
        }[]
      }
      platform_record_integration_test: {
        Args: {
          p_provider: string
          p_ok: boolean
          p_message: string
        }
        Returns: undefined
      }
      platform_record_manual_payment: {
        Args: {
          p_invoice: string
          p_reference: string
          p_amount: number
          p_method: string
          p_note?: string
        }
        Returns: Json
      }
      platform_revoke_user_sessions: {
        Args: {
          p_user: string
        }
        Returns: number
      }
      platform_security_overview: {
        Args: never
        Returns: Json
      }
      platform_set_messaging_quota: {
        Args: {
          p_org: string
          p_email: number
          p_sms: number
          p_whatsapp: number
        }
        Returns: undefined
      }
      platform_unlock_account: {
        Args: {
          p_identifier_hash: string
        }
        Returns: undefined
      }
      platform_update_billing_settings: {
        Args: {
          p_past_due: number
          p_restrict: number
          p_expire: number
          p_renewal_notice: number
        }
        Returns: undefined
      }
      platform_update_integration: {
        Args: {
          p_provider: string
          p_enabled: boolean
          p_config: Json
          p_secret_ciphertext?: string
          p_secret_hint?: string
          p_clear_secret?: boolean
        }
        Returns: undefined
      }
      platform_update_messaging_settings: {
        Args: {
          p_email: number
          p_sms: number
          p_whatsapp: number
        }
        Returns: undefined
      }
      platform_update_plan: {
        Args: {
          p_plan: string
          p_description: string
          p_audience: string
          p_is_active: boolean
          p_features: Json
        }
        Returns: undefined
      }
      platform_update_security_settings: {
        Args: {
          p_lockout_threshold: number
          p_lockout_minutes: number
          p_captcha_after: number
          p_mfa_required: boolean
          p_email_verification: boolean
        }
        Returns: undefined
      }
      platform_upsert_whatsapp_template: {
        Args: {
          p_name: string
          p_language: string
          p_description: string
          p_variables: number
          p_enabled: boolean
        }
        Returns: string
      }
      portal_account: {
        Args: {
          p_kind: string
          p_record_id: string
        }
        Returns: Json
      }
      portal_account_counts: {
        Args: {
          p_org: string
        }
        Returns: Json
      }
      portal_class_subjects: {
        Args: {
          p_student_id: string
        }
        Returns: {
          subject: string
          color: string
          coefficient: number
          teacher: string
          is_head_teacher: boolean
        }[]
      }
      portal_status: {
        Args: {
          p_student_id: string
        }
        Returns: Json
      }
      portal_students: {
        Args: {
          p_organization_id: string
        }
        Returns: {
          id: string
          first_name: string
          last_name: string
          matricule: string
          birth_date: string
          photo_path: string
          status: string
          class_id: string
          class_name: string
          academic_year_id: string
          is_self: boolean
        }[]
      }
      portal_timetable: {
        Args: {
          p_student_id: string
        }
        Returns: {
          id: string
          weekday: number
          starts_at: string
          ends_at: string
          subject: string
          color: string
          teacher: string
          room: string
        }[]
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
      register_curriculum: {
        Args: {
          p_enrollment_id: string
          p_period_id: string
        }
        Returns: number
      }
      reopen_attendance_session: {
        Args: {
          p_session_id: string
          p_reason: string
        }
        Returns: undefined
      }
      report_section: {
        Args: {
          p_organization_id: string
          p_section: string
        }
        Returns: Json
      }
      review_absence_justification: {
        Args: {
          p_id: string
          p_decision: string
          p_comment?: string
        }
        Returns: number
      }
      revoke_my_session: {
        Args: {
          p_session: string
        }
        Returns: undefined
      }
      save_grades: {
        Args: {
          p_assessment_id: string
          p_grades: Json
        }
        Returns: number
      }
      scan_badge: {
        Args: {
          p_organization_id: string
          p_code: string
          p_device?: string
          p_room_id?: string
        }
        Returns: Json
      }
      scan_badge_core: {
        Args: {
          p_organization_id: string
          p_code: string
          p_device?: string
          p_room_id?: string
        }
        Returns: Json
      }
      scan_staff_badge: {
        Args: {
          p_organization_id: string
          p_code: string
          p_device?: string
        }
        Returns: Json
      }
      scan_staff_badge_core: {
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
      set_school_config: {
        Args: {
          p_org: string
          p_levels: string[]
          p_tracks: string[]
        }
        Returns: Json
      }
      set_subscription_components: {
        Args: {
          p_org: string
          p_components: string[]
        }
        Returns: string[]
      }
      set_training_config: {
        Args: {
          p_org: string
          p_config: Json
        }
        Returns: Json
      }
      set_university_config: {
        Args: {
          p_org: string
          p_config: Json
        }
        Returns: Json
      }
      signup_create_organization: {
        Args: {
          p_user: string
          p_name: string
          p_code_base: string
          p_type: Database["public"]["Enums"]["organization_type"]
          p_city: string
          p_country: string
          p_phone: string
          p_email: string
          p_plan_code: string
          p_interval: string
        }
        Returns: Json
      }
      start_thread: {
        Args: {
          p_organization_id: string
          p_subject: string
          p_body: string
          p_recipients: string[]
        }
        Returns: string
      }
      student_status_counts: {
        Args: {
          p_organization_id: string
        }
        Returns: Json
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
      thread_messages: {
        Args: {
          p_thread_id: string
        }
        Returns: {
          id: string
          body: string
          created_at: string
          sender: string
          mine: boolean
        }[]
      }
      training_dashboard: {
        Args: {
          p_organization_id: string
          p_date?: string
        }
        Returns: Json
      }
      training_statistics: {
        Args: {
          p_organization_id: string
          p_from?: string
          p_to?: string
        }
        Returns: Json
      }
      university_statistics: {
        Args: {
          p_organization_id: string
          p_from?: string
          p_to?: string
        }
        Returns: Json
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
      verify_organization_email: {
        Args: {
          p_token_hash: string
        }
        Returns: Json
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
