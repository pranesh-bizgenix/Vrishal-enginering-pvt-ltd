'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import axios, { AxiosError } from 'axios';
import { EnvelopeIcon, LockClosedIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { API_URL } from '../../lib/api';
import { getToken, saveAuth } from '../../lib/auth';
import { showSuccessToast, showWarningToast } from '../../lib/customToast';
import { useEffect, useRef } from 'react';
import Image from 'next/image';

// Validation schema
const LoginSchema = Yup.object().shape({
  email: Yup.string()
    .email('Enter a valid email.')
    .max(254, 'Your email must not be greater than 255 characters long.')
    .required('Email is required.'),
  password: Yup.string()
    .min(8, 'Password must be at least 8 characters long.')
    .required('Password is required.'),
});

const Login = () => {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (getToken()) {
      router.replace('/dashboard');
    }
  }, [router]);

  const formik = useFormik({
    initialValues: { email: '', password: '' },
    validationSchema: LoginSchema,
    onSubmit: async (values, { setSubmitting, setFieldError }) => {
      try {
        const res = await axios.post(`${API_URL}/auth/login`, values);
        const normalizedEmail = res.data.data.email?.trim().toLowerCase?.() || values.email.trim().toLowerCase();
        const companyKey = res.data.data.companyKey || 'company_1';
        saveAuth(res.data.data.access_token, {
          id: String(res.data.data.id || normalizedEmail),
          name: res.data.data.name || normalizedEmail,
          email: normalizedEmail,
          role: 'ADMIN',
        });
        localStorage.setItem('roles', JSON.stringify(res.data.data.roles));
        localStorage.setItem('email', normalizedEmail);
        localStorage.setItem('companyKey', companyKey);
        router.replace('/dashboard');
        setSubmitting(false);
        showSuccessToast('User Login', 'Success');
      } catch (err: unknown) {
        const error = err as AxiosError<{ message?: string }>;
        showWarningToast('Warning', 'Invalid email or password.');
        if (error.response?.status === 401 || error.response?.status === 400) {
          setFieldError('password', 'Incorrect password.');
        } else {
          setFieldError('password', error.message || 'Login failed');
        }
        setSubmitting(false);
      }
    },
  });

  return (
    <div className="h-screen bg-gray-100 flex flex-col justify-center">
      {/* Top Branding with animation */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-6">
          <div className="z-10 flex items-center gap-3 rounded-2xl border border-white/80 bg-white/72 px-4 py-4 shadow-[0_16px_36px_rgba(15,23,42,0.10)] backdrop-blur-md sm:left-6 sm:top-6">
        <Image alt="Vrishal Engineering Pvt Ltd" className="h-11 w-11 rounded-xl border border-white object-cover shadow-[0_12px_26px_rgba(15,23,42,0.12)]" height={44} priority src="/vrishal-logo.jpg" width={44} />
        <div className="hidden sm:block">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#396184]">Vrishal Engineering Pvt Ltd</p>

          <div className="inline-flex items-center gap-2 rounded-2xl transform transition-transform duration-300">
            <div className="relative">
              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 animate-ping absolute"></div>
              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 relative"></div>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent tracking-wider">
              TMS PLATFORM
            </span>
          </div>
        </div>
      </div>
          
        </div>
      </div>
      <div className="flex justify-center px-4">
        <div className="bg-[#F4F4F4] w-full max-w-[30.13rem] rounded-[0.63rem] border-[0.13rem] border-white shadow-[0_20px_50px_rgba(0,0,0,0.12)] px-8 sm:px-10 py-8">
          <h1 className="text-2xl font-semibold text-[#010048] text-center">Log into your Account</h1>
          <p className="text-xs text-center text-gray-400 mt-4 mb-6">Streamline · Analyze · Grow Smarter</p>
          <form onSubmit={formik.handleSubmit} noValidate className="space-y-4">
            {/* Email */}
            <div>
              <label className="mb-2 block text-sm font-medium text-[#010048]">
                Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <EnvelopeIcon className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  name="email"
                  placeholder="Enter Email"
                  autoComplete="off"
                  value={formik.values.email}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      passwordRef.current?.focus();
                    }
                  }}
                  className="border border-gray-300 p-2 pl-12 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-[#010048] bg-[#5881fe12]"
                />
              </div>
              {formik.touched.email && formik.errors.email && (
                <div className="bg-[#fc951a17] text-[#FB951A] text-sm p-2 rounded-lg mt-2">{formik.errors.email}</div>
              )}
            </div>
            {/* Password */}
            <div>
              <label className="mb-2 block text-sm font-medium text-[#010048]">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                {/* Left Lock Icon */}
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <LockClosedIcon className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="Enter Password"
                  autoComplete="off"
                  value={formik.values.password}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className="border border-gray-300 p-2 pl-12 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-[#010048] bg-[#5881fe12]"
                />
                {/* Right Eye Button */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-500"
                >
                  {showPassword ? (
                    <EyeSlashIcon className="w-5 h-5" />
                  ) : (
                    <EyeIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
              {formik.touched.password && formik.errors.password && (
                <div className="bg-[#fc951a17] text-[#FB951A] text-sm p-2 rounded-lg mt-2">{formik.errors.password}</div>
              )}
            </div>
            <button
              type="submit"
              disabled={formik.isSubmitting}
              className="mt-2 w-full rounded-2xl bg-[#396184] px-5 py-3 text-sm font-bold text-white shadow-[0_14px_28px_rgba(57,97,132,0.24)] transition hover:-translate-y-0.5 hover:bg-[#2f526f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {formik.isSubmitting ? 'Logging in...' : 'Log In'}
            </button>
          </form>
          {/* <div className="text-center mt-4">
            <a href="/auth/forgot-password" className="text-sm text-[#38128A] hover:underline">Forgot password?</a>
          </div> */}
          {/* Security badges - moved up */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold text-slate-500">
              🔒 256-bit encryption
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold text-slate-500">
              ⚡ 24/7 support
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold text-slate-500">
              ✓ Secure access
            </div>
          </div>
          <div className="mt-4 text-center text-xs text-slate-500">
            © {new Date().getFullYear()}{' '}
            <span className="font-semibold text-[#396184]">Vrishal Engineering Pvt Ltd</span>. All Rights Reserved
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
